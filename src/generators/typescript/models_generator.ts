import type { OpenAPIV3_1 } from "openapi-types";
import type { Config } from "../../types/config";
import { JSDocStructure, OptionalKind, PropertySignatureStructure, SourceFile } from "ts-morph";
import { getResolvedSchema, pascalCase } from "./util";
import { schemaToTypeLiteral } from "./schema_to_ts";

const jsonSchemaTags: Array<keyof OpenAPIV3_1.SchemaObject> = [
  "title",
  'maxItems',
  'minItems',
  'maxLength',
  'minLength',
  "uniqueItems",
  'maximum',
  'minimum',
  "exclusiveMaximum",
  "exclusiveMinimum",
  'pattern',
  'format',
  'example',
];

const standardFormatsWithRedundantPatterns = new Set([
  'date',
  'date-time',
  'uuid',
  'email',
  'ipv4',
  'ipv6',
  'uri',
  'url',
]);

function shouldIgnorePattern(schema: any): boolean {
  const format = schema.format;
  if (format && standardFormatsWithRedundantPatterns.has(format)) {
    return true;
  }
  const subFormats = (schema.oneOf || schema.anyOf)?.map((s: any) => s?.format).filter(Boolean);
  if (subFormats && subFormats.some((f: string) => standardFormatsWithRedundantPatterns.has(f))) {
    return true;
  }
  return false;
}


function createInterfaceModel(doc: OpenAPIV3_1.Document, file: SourceFile, name: string, schema: OpenAPIV3_1.NonArraySchemaObject) {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    file.addTypeAlias({
      name: pascalCase(name),
      isExported: true,
      type: schema.additionalProperties ? 'Record<string, unknown>' : '{}',
    });
    return;
  }

  const jsdocs = generateSchemaDocs(schema, doc);
  const interfaceDeclaration = file.addInterface({
    name: pascalCase(name),
    isExported: true,
    docs: jsdocs ? [jsdocs] : [],
  });

  for (const [propName, propSchema] of Object.entries(schema.properties || {})) {
    const prop = generatePropertySignature(doc, propName, propSchema);
    prop.hasQuestionToken = !(schema.required || []).includes(propName);

    interfaceDeclaration.addProperty(prop);
  }

  if (schema.additionalProperties) {
    interfaceDeclaration.addIndexSignature({
      keyName: 'k',
      keyType: 'string',
      returnType: 'unknown',
    });
  }
}

function generateSchemaDocs(schema: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject, doc: OpenAPIV3_1.Document) {
  const jsdoc: OptionalKind<JSDocStructure> = {
    description: (schema as any).description || '',
    tags: []
  }

  if ('$ref' in schema) {
    jsdoc.tags?.push({
      tagName: 'see',
      text: (writer) => {
        writer.write('{@link ');
        schemaToTypeLiteral(schema, doc)(writer);
        writer.write('}');
      },
    });
  }

  for (const tagName of jsonSchemaTags) {
    if (tagName === 'pattern' && shouldIgnorePattern(schema)) {
      continue;
    }

    const value = (schema as any)[tagName];

    if (value !== undefined) {
      jsdoc.tags?.push({
        tagName: tagName,
        text: String(value),
      });
    } else if (tagName === 'format') {
      const subFormats = ((schema as any).oneOf || (schema as any).anyOf)
        ?.map((sub: any) => sub?.format)
        .filter(Boolean);
      if (subFormats && subFormats.length > 0) {
        jsdoc.tags?.push({
          tagName: 'format',
          text: Array.from(new Set(subFormats)).join(' | '),
        });
      }
    }
  }

  if (!jsdoc.tags?.length && !jsdoc.description) {
    return null
  }

  return jsdoc;
}

function generatePropertySignature(doc: OpenAPIV3_1.Document, propName: string, propSchema: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject): OptionalKind<PropertySignatureStructure> {
  const jsdoc = generateSchemaDocs(propSchema, doc);
  return {
    name: propName,
    type: schemaToTypeLiteral(propSchema, doc),
    docs: jsdoc ? [jsdoc] : [],
  }
}

export function createModel(doc: OpenAPIV3_1.Document, file: SourceFile, name: string, schema: OpenAPIV3_1.NonArraySchemaObject | OpenAPIV3_1.ReferenceObject) {
  if (!('$ref' in schema) && (schema.type === 'object' || (!schema.type && schema.properties)) && schema.properties) {
    createInterfaceModel(doc, file, name, schema);
    return;
  }

  const jsdoc = generateSchemaDocs(schema, doc);

  file.addTypeAlias({
    name: pascalCase(name),
    isExported: true,
    type: schemaToTypeLiteral(schema, doc),
    docs: jsdoc ? [jsdoc] : [],
  })
}

function findReferencedSchemas(obj: any, refs: Set<string> = new Set()): Set<string> {
  if (!obj || typeof obj !== 'object') return refs;
  for (const [k, v] of Object.entries(obj)) {
    if (k === '$ref' && typeof v === 'string') {
      const parts = v.split('#/components/schemas/');
      if (parts.length > 1 && parts[1]) {
        refs.add(parts[1]);
      }
    } else {
      findReferencedSchemas(v, refs);
    }
  }
  return refs;
}

export async function generateModels(file: SourceFile, config: Config, doc: OpenAPIV3_1.Document) {
  const schemas = doc?.components?.schemas;

  if (schemas) {
    for (const [schemaName, schema] of Object.entries(schemas)) {
      createModel(doc, file, schemaName, schema as any);
    }
  }

  const referencedSchemas = findReferencedSchemas(doc);
  for (const refName of referencedSchemas) {
    const pascalName = pascalCase(refName);
    if (!file.getTypeAlias(pascalName) && !file.getInterface(pascalName)) {
      file.addTypeAlias({
        name: pascalName,
        isExported: true,
        type: 'Record<string, unknown>',
        docs: [
          {
            description: `Aviso: Este schema não existe ou não foi declarado na especificação OpenAPI ('#/components/schemas/${refName}').\nGerado automaticamente como fallback para evitar quebras de referência e erros de compilação.`,
          },
        ],
      });
    }
  }
}