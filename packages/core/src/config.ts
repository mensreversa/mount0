export interface BackendConfig {
  type: string;
  options: Record<string, any>;
}

export interface PathMapping {
  path: string;
  backend: string;
}

export interface MountConfig {
  backends: Record<string, BackendConfig>;
  mappings: PathMapping[];
}
