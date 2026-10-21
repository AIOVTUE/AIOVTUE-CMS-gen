import { Resend } from "resend";
import nodemailer from "nodemailer";
import { getAppConfig } from "@/lib/app-config/store";

type MailProvider = "resend" | "smtp";

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
};

type SmtpTransporter = {
  sendMail: (options: {
    from: string;
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
  }) => Promise<{ rejected?: string[] }>;
};

let smtpTransporter: SmtpTransporter | null = null;
let smtpFingerprint = "";

export const sendEmail = async ({ to, subject, html, text }: SendEmailInput) => {
  const recipients = Array.isArray(to) ? to : [to];
  if (recipients.length === 0) throw new Error("At least one recipient is required.");

  const config = await getAppConfig();
  const from = config.emailFrom;
  if (!from) {
    throw new Error("未配置发件人邮箱。请在初始化中填写发件人。");
  }

  const provider = config.emailProvider as MailProvider | "";
  if (provider !== "resend" && provider !== "smtp") {
    throw new Error("未配置邮件服务。请在初始化中选择 Resend 或 SMTP。");
  }

  if (provider === "resend") {
    if (!config.resendApiKey) throw new Error("未配置 Resend API Key。");

    const resend = new Resend(config.resendApiKey);
    const { error } = await resend.emails.send({
      from,
      to: recipients,
      subject,
      html,
      text,
    });

    if (error) throw new Error(error.message);
    return;
  }

  const host = config.smtpHost;
  if (!host) throw new Error("未配置 SMTP 主机。");

  const port = Number(config.smtpPort || "587");
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("SMTP 端口无效。");
  }

  const secure = config.smtpSecure || port === 465;
  const user = config.smtpUser || "";
  const pass = config.smtpPassword || "";
  if ((user && !pass) || (!user && pass)) {
    throw new Error("SMTP 用户名与密码需同时填写。");
  }

  const fingerprint = `${host}|${port}|${secure}|${user}|${pass}`;
  if (!smtpTransporter || smtpFingerprint !== fingerprint) {
    smtpTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user && pass ? { auth: { user, pass } } : {}),
    });
    smtpFingerprint = fingerprint;
  }

  const info = await smtpTransporter.sendMail({
    from,
    to: recipients,
    subject,
    html,
    text,
  });

  if (info.rejected && info.rejected.length > 0) {
    throw new Error(`邮件被拒绝: ${info.rejected.join(", ")}`);
  }
};
