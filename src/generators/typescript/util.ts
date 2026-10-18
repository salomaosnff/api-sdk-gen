import { OpenAPIV3_1 } from "openapi-types";

export function pascalCase(str: string): string {
  return str.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
}

export function resolveSchema(ref: string): string {
  const parts = ref.split('#/components/schemas/');
  return pascalCase(parts[1] || parts[0]);
}

export function jsonPointer(path: string, json: any): any {
  path = path.replace(/^#?\/?/, '')
  const parts = path.split('/');
  let result = json;

  for (const part of parts) {
    result = result[part];

    if (result === undefined || result === null) {
      break;
    }
  }

  return result;
}

export function getResolvedSchema(schema: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject, doc: OpenAPIV3_1.Document): OpenAPIV3_1.SchemaObject {
  if ('$ref' in schema) {
    const resolved = jsonPointer(schema.$ref, doc) as OpenAPIV3_1.SchemaObject;
    return getResolvedSchema(resolved, doc);
  }

  return schema;
}