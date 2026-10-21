"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Config } from "@/types/config";

interface ConfigContextType {
  config: Config | null;
  setConfig: (config: Config | null) => void;
}

const ConfigContext = createContext<ConfigContextType | null>(null);

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    throw new Error("useConfig must be used within a ConfigProvider");
  }
  return context;
};

export const useConfigOptional = () => useContext(ConfigContext);

const configIdentity = (value: Config | null) =>
  value
    ? `${value.owner}/${value.repo}/${value.branch}:${value.sha}`
    : "";

export const ConfigProvider = ({
  value,
  children,
}: {
  value: Config | null;
  children: React.ReactNode;
}) => {
  const [config, setConfig] = useState<Config | null>(value);
  const lastServerId = useRef(configIdentity(value));

  // Sync only when the server ships a different identity/sha (not every render).
  useEffect(() => {
    const nextId = configIdentity(value);
    if (nextId === lastServerId.current) return;
    lastServerId.current = nextId;
    setConfig(value);
  }, [value]);

  const contextValue = useMemo(
    () => ({ config, setConfig }),
    [config],
  );

  return (
    <ConfigContext.Provider value={contextValue}>
      {children}
    </ConfigContext.Provider>
  );
};
