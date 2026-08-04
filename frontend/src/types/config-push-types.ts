export interface CommandArg {
  name: string;
  label: string;
  type: 'string' | 'integer' | 'ip' | 'cidr' | 'vlan_range' | 'boolean' | 'select';
  optional: boolean;
  default?: string | number | boolean;
  placeholder?: string;
  options?: { label: string; value: string }[];
  min?: number;
  max?: number;
}

export interface GeneratedLine {
  line: string;
  args: CommandArg[];
  optional: boolean;
}

export interface CommandTemplate {
  id: string;
  label: string;
  category: string;
  modes: string[];
  generates: GeneratedLine[];
  dependencies?: string[];
}

export interface CommandCategory {
  id: string;
  label: string;
  icon: string;
  templates: string[];
}

export interface DellOS10Catalog {
  categories: CommandCategory[];
  templates: Record<string, CommandTemplate>;
}

export interface BuiltCommand {
  categoryId: string;
  templateId: string;
  values: Record<string, string>;
  generatedLines: string[];
}

export const COMMAND_ORDER: Record<string, number> = {
  vlan: 1,
  vrf: 2,
  interface: 3,
  lag: 4,
  stp: 5,
  bgp: 6,
  static_route: 7,
  system: 8,
  aaa: 9,
  qos: 10,
};
