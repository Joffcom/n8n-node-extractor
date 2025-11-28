export interface CompleteNodeDescription {
  displayName: string;
  name: string;
  icon?: string;
  iconUrl?: string;
  group: string[];
  version: number | number[];
  description: string;
  usableAsTool?: boolean;
  defaults: Record<string, any>;
  inputs: string[];
  outputs: string[];
  credentials?: Array<{
    name: string;
    required?: boolean;
    displayOptions?: {
      show?: Record<string, any>;
      hide?: Record<string, any>;
    };
  }>;
  properties: Array<{
    displayName: string;
    name: string;
    type: string;
    default?: any;
    description?: string;
    options?: Array<{
      name: string;
      value: string | number | boolean;
      description?: string;
      action?: string;
    }>;
    required?: boolean;
    displayOptions?: {
      show?: Record<string, any>;
      hide?: Record<string, any>;
    };
    placeholder?: string;
    typeOptions?: Record<string, any>;
    noDataExpression?: boolean;
  }>;
  webhooks?: Array<{
    name: string;
    httpMethod: string;
    responseMode?: string;
    path: string;
  }>;
  polling?: boolean;
  subtitle?: string;
  __loadOptionsMethods?: string[];
  codex?: {
    categories?: string[];
    subcategories?: Record<string, string[]>;
    resources?: {
      primaryDocumentation?: Array<{
        url: string;
        title?: string;
      }>;
      credentialDocumentation?: Array<{
        url: string;
        title?: string;
      }>;
    };
  };
}

export interface PackageInfo {
  name: string;
  version: string;
  dist: { tarball: string };
}

export interface ExtractorConfig {
  tempDir?: string;
  outputDir?: string;
  verbose?: boolean;
}

export interface ExtractionResult<T = CompleteNodeDescription> {
  extractedAt: string;
  totalNodes: number;
  format: string;
  nodes: T[];
}
