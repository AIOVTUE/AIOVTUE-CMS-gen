import { execFile } from "node:child_process";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const STORE_DIR = path.join(process.cwd(), ".pagescms");
const STORE_FILE = path.join(STORE_DIR, "workspace-paths.json");

type WorkspaceStore = Record<string, string>;

export type WorkspacePathInfo = {
  path: string;
  source: "override" | "env" | "unset";
  exists: boolean;
  writable: boolean;
  isGitRepo: boolean;
};

/** Internal store key for the active local project slug (URL [repo] segment). */
const ACTIVE_LOCAL_REPO_KEY = "__activeLocalRepo";

let cache: WorkspaceStore | null = null;
let cacheMtimeMs = -1;

const workspaceKey = (owner: string, repo: string) =>
  `${owner.toLowerCase()}/${repo.toLowerCase()}`;

/** Folder basename → URL repo segment (keeps Unicode; blocks path/route breakers). */
const localRepoNameFromPath = (absolutePath: string) => {
  const base = path.basename(path.resolve(absolutePath)).trim();
  if (!base || base === "." || base === "..") {
    throw new Error("无法从目录路径生成项目名称。");
  }
  if (/[\\/?#\u0000-\u001F]/.test(base)) {
    throw new Error("目录名包含非法字符，无法用作项目路径。");
  }
  return base;
};

const getActiveLocalRepoName = (): string | null => {
  const value = readStoreSync()[ACTIVE_LOCAL_REPO_KEY];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
};

const setActiveLocalRepoName = async (repoName: string | null) => {
  const current = { ...readStoreSync() };
  if (!repoName || !repoName.trim()) {
    if (!(ACTIVE_LOCAL_REPO_KEY in current)) return;
    delete current[ACTIVE_LOCAL_REPO_KEY];
  } else {
    const next = repoName.trim();
    if (current[ACTIVE_LOCAL_REPO_KEY] === next) return;
    current[ACTIVE_LOCAL_REPO_KEY] = next;
  }
  await writeStore(current);
};

const readStoreSync = (): WorkspaceStore => {
  try {
    const stat = fs.statSync(STORE_FILE);
    if (cache && stat.mtimeMs === cacheMtimeMs) return cache;
    const raw = fs.readFileSync(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    cache =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as WorkspaceStore)
        : {};
    cacheMtimeMs = stat.mtimeMs;
  } catch {
    cache = {};
    cacheMtimeMs = -1;
  }
  return cache;
};

const writeStore = async (next: WorkspaceStore) => {
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  // Skip disk writes when unchanged — rewriting .pagescms triggers Turbopack HMR loops.
  try {
    const existing = fs.readFileSync(STORE_FILE, "utf8");
    if (existing === serialized) {
      cache = next;
      return;
    }
  } catch {
    // file missing — continue to write
  }
  await fsPromises.mkdir(STORE_DIR, { recursive: true });
  await fsPromises.writeFile(STORE_FILE, serialized, "utf8");
  cache = next;
  try {
    cacheMtimeMs = fs.statSync(STORE_FILE).mtimeMs;
  } catch {
    cacheMtimeMs = -1;
  }
};

/** Absolute path override for a repo, if set and the directory still exists. */
const getWorkspacePathOverride = (owner: string, repo: string): string | null => {
  const value = readStoreSync()[workspaceKey(owner, repo)];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const absolute = path.resolve(trimmed);
  try {
    if (!fs.statSync(absolute).isDirectory()) return null;
  } catch {
    // Broken / mojibake paths from older Windows console encoding — ignore.
    return null;
  }
  return absolute;
};

/**
 * First usable on-disk override for a local owner (any project slug).
 * Used to migrate legacy `/local/hugo-blog` URLs to the folder basename.
 */
const findLocalWorkspaceOverride = (
  owner: string,
): { storeRepo: string; path: string } | null => {
  const prefix = `${owner.toLowerCase()}/`;
  const store = readStoreSync();
  for (const [key, value] of Object.entries(store)) {
    if (key === ACTIVE_LOCAL_REPO_KEY) continue;
    if (!key.startsWith(prefix)) continue;
    if (typeof value !== "string" || !value.trim()) continue;
    const absolute = path.resolve(value.trim());
    try {
      if (!fs.statSync(absolute).isDirectory()) continue;
    } catch {
      continue;
    }
    return { storeRepo: key.slice(prefix.length), path: absolute };
  }
  return null;
};

const setWorkspacePathOverride = async (
  owner: string,
  repo: string,
  absolutePath: string | null,
) => {
  const key = workspaceKey(owner, repo);
  const current = { ...readStoreSync() };
  if (!absolutePath || !absolutePath.trim()) {
    if (!(key in current)) return;
    delete current[key];
  } else {
    const resolved = path.resolve(absolutePath.trim());
    if (current[key] === resolved) return;
    current[key] = resolved;
  }
  await writeStore(current);
};

const normalizeCandidatePath = (raw: string) => {
  const trimmed = raw.trim().replace(/^["']|["']$/g, "");
  if (!trimmed) throw new Error("路径不能为空。");
  return path.resolve(trimmed);
};

const inspectWorkspacePath = async (rawPath: string): Promise<{
  path: string;
  exists: boolean;
  writable: boolean;
  isGitRepo: boolean;
}> => {
  const absolute = normalizeCandidatePath(rawPath);
  let exists = false;
  let writable = false;
  let isGitRepo = false;

  try {
    const stat = await fsPromises.stat(absolute);
    exists = stat.isDirectory();
  } catch {
    exists = false;
  }

  if (exists) {
    try {
      await fsPromises.access(absolute, fs.constants.R_OK | fs.constants.W_OK);
      writable = true;
    } catch {
      writable = false;
    }
    try {
      const gitStat = await fsPromises.stat(path.join(absolute, ".git"));
      isGitRepo = gitStat.isDirectory() || gitStat.isFile();
    } catch {
      isGitRepo = false;
    }
  }

  return { path: absolute, exists, writable, isGitRepo };
};

/**
 * Optional allowlist: only enforced when LOCAL_REPO_ALLOWED_ROOTS is set.
 * By default any existing writable directory may be remounted (admin-gated).
 */
const getAllowedWorkspaceRoots = (): string[] => {
  const raw = process.env.LOCAL_REPO_ALLOWED_ROOTS?.trim();
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => path.resolve(part));
};

const isUnderPrefix = (absolute: string, prefix: string) => {
  const root = path.resolve(prefix);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  return absolute === root || absolute.startsWith(rootWithSep);
};

const assertWorkspacePathAllowed = (absolutePath: string) => {
  const allowed = getAllowedWorkspaceRoots();
  if (allowed.length === 0) return;
  const absolute = path.resolve(absolutePath);
  const ok = allowed.some((root) => isUnderPrefix(absolute, root));
  if (!ok) {
    throw new Error(
      `工作区路径必须位于 LOCAL_REPO_ALLOWED_ROOTS 配置的目录下。`,
    );
  }
};

const assertUsableWorkspacePath = async (rawPath: string) => {
  const info = await inspectWorkspacePath(rawPath);
  if (!info.exists) {
    throw new Error(`目录不存在：${info.path}`);
  }
  if (!info.writable) {
    throw new Error(`目录不可写：${info.path}`);
  }
  assertWorkspacePathAllowed(info.path);
  return info;
};

/**
 * Native folder picker when the CMS Node process runs on the user's desktop.
 * Falls back to null on unsupported platforms / headless hosts.
 */
const browseWorkspacePath = async (): Promise<string | null> => {
  if (process.platform === "win32") {
    // Vista+ IFileOpenDialog (modern Explorer picker), not legacy FolderBrowserDialog.
    const stamp = `${process.pid}-${Date.now()}`;
    const scriptPath = path.join(os.tmpdir(), `pagescms-folder-picker-${stamp}.ps1`);
    const resultPath = path.join(os.tmpdir(), `pagescms-folder-result-${stamp}.txt`);
    const script = `#Requires -Version 5.0
param(
  [Parameter(Mandatory = $true)]
  [string]$OutFile
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -Language CSharp -TypeDefinition @"
using System;
using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public static class PagesCmsFolderPicker {
  [ComImport]
  [Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
  private class FileOpenDialogRCW {}

  [ComImport]
  [Guid("42F85136-DB7E-439C-85F1-E4075D135FC8")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IShellItem psi, int fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
  }

  [ComImport]
  [Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, out IntPtr ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
  }

  [DllImport("user32.dll")]
  private static extern IntPtr GetForegroundWindow();

  [DllImport("user32.dll")]
  private static extern bool SetForegroundWindow(IntPtr hWnd);

  [DllImport("user32.dll")]
  private static extern bool BringWindowToTop(IntPtr hWnd);

  [DllImport("user32.dll")]
  private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr processId);

  [DllImport("kernel32.dll")]
  private static extern uint GetCurrentThreadId();

  [DllImport("user32.dll")]
  private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

  private const uint FOS_PICKFOLDERS = 0x00000020;
  private const uint FOS_FORCEFILESYSTEM = 0x00000040;
  private const uint FOS_PATHMUSTEXIST = 0x00000800;
  private const uint SIGDN_FILESYSPATH = 0x80058000;
  private const int SW_RESTORE = 9;

  private static void ForceForeground(IntPtr hwnd) {
    IntPtr foreground = GetForegroundWindow();
    uint targetThread = GetWindowThreadProcessId(hwnd, IntPtr.Zero);
    uint foregroundThread = GetWindowThreadProcessId(foreground, IntPtr.Zero);
    uint currentThread = GetCurrentThreadId();
    bool attachedFg = false;
    bool attachedTarget = false;
    try {
      if (foreground != IntPtr.Zero && foregroundThread != currentThread) {
        attachedFg = AttachThreadInput(currentThread, foregroundThread, true);
      }
      if (targetThread != currentThread) {
        attachedTarget = AttachThreadInput(currentThread, targetThread, true);
      }
      ShowWindow(hwnd, SW_RESTORE);
      BringWindowToTop(hwnd);
      SetForegroundWindow(hwnd);
    } finally {
      if (attachedTarget) AttachThreadInput(currentThread, targetThread, false);
      if (attachedFg) AttachThreadInput(currentThread, foregroundThread, false);
    }
  }

  public static string Pick(string title) {
    using (var owner = new Form()) {
      owner.Text = string.IsNullOrEmpty(title) ? "Select Folder" : title;
      owner.ShowInTaskbar = false;
      owner.FormBorderStyle = FormBorderStyle.FixedToolWindow;
      owner.StartPosition = FormStartPosition.Manual;
      owner.Bounds = new Rectangle(-32000, -32000, 1, 1);
      owner.Opacity = 0;
      owner.TopMost = true;
      owner.Show();
      ForceForeground(owner.Handle);
      Application.DoEvents();

      var dialog = (IFileDialog)new FileOpenDialogRCW();
      try {
        uint options;
        dialog.GetOptions(out options);
        dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST);
        dialog.SetTitle(owner.Text);
        ForceForeground(owner.Handle);
        Application.DoEvents();
        // Own a TopMost hidden form so the picker stays above the browser.
        if (dialog.Show(owner.Handle) != 0) return null;
        IShellItem item;
        dialog.GetResult(out item);
        IntPtr psz;
        item.GetDisplayName(SIGDN_FILESYSPATH, out psz);
        try { return Marshal.PtrToStringUni(psz); }
        finally { Marshal.FreeCoTaskMem(psz); }
      } finally {
        Marshal.FinalReleaseComObject(dialog);
        owner.Close();
      }
    }
  }
}
"@
$path = [PagesCmsFolderPicker]::Pick('选择本地项目目录')
if ($path) {
  # Avoid console code-page corruption for non-ASCII paths (e.g. 沐雪\\文件).
  [System.IO.File]::WriteAllText($OutFile, $path, (New-Object System.Text.UTF8Encoding $false))
}
`;
    try {
      // Windows PowerShell 5.1 needs a BOM to read Chinese titles from UTF-8 scripts.
      await fsPromises.writeFile(scriptPath, `\uFEFF${script}`, "utf8");
      await execFileAsync(
        "powershell.exe",
        [
          "-NoProfile",
          "-STA",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          "-OutFile",
          resultPath,
        ],
        { timeout: 180_000, windowsHide: false, maxBuffer: 1024 * 1024 },
      );
      try {
        const selected = (await fsPromises.readFile(resultPath, "utf8")).trim();
        return selected ? path.resolve(selected) : null;
      } catch {
        return null;
      }
    } finally {
      await Promise.all([
        fsPromises.unlink(scriptPath).catch(() => undefined),
        fsPromises.unlink(resultPath).catch(() => undefined),
      ]);
    }
  }

  if (process.platform === "darwin") {
    const { stdout } = await execFileAsync(
      "osascript",
      [
        "-e",
        'POSIX path of (choose folder with prompt "选择本地项目目录")',
      ],
      { timeout: 180_000, maxBuffer: 1024 * 1024 },
    );
    const selected = stdout.trim().replace(/\/$/, "");
    return selected ? path.resolve(selected) : null;
  }

  // Linux / headless: no reliable native dialog without extra deps.
  return null;
};

const getWorkspacePlaceholder = () => {
  if (process.platform === "win32") {
    return path.join("D:", "projects", "my-hugo-blog");
  }
  return path.join(os.homedir(), "projects", "my-hugo-blog");
};

export {
  getWorkspacePathOverride,
  setWorkspacePathOverride,
  inspectWorkspacePath,
  assertUsableWorkspacePath,
  browseWorkspacePath,
  getWorkspacePlaceholder,
  normalizeCandidatePath,
  localRepoNameFromPath,
  getActiveLocalRepoName,
  setActiveLocalRepoName,
  findLocalWorkspaceOverride,
};
