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
]


function createInterfaceModel(doc: OpenAPIV3_1.Document, file: SourceFile, name: string, schema: OpenAPIV3_1.NonArraySchemaObject) {
  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    file.addTypeAlias({
      name: pascalCase(name),
      isExported: true,
      type: '{}',
    })
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

function generateSchemaDocs(schema: OpenAPIV3_1.SchemaObject, doc: OpenAPIV3_1.Document) {
  const jsdoc: OptionalKind<JSDocStructure> = {
    description: schema.description || '',
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
    const value = (schema as any)[tagName];

    if (value !== undefined) {
      jsdoc.tags?.push({
        tagName: tagName,
        text: String(value),
      });
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
  if ('$ref' in schema) {
    return;
  }

  if (schema.type === 'object' && schema.properties) {
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

export async function generateModels(file: SourceFile, config: Config, doc: OpenAPIV3_1.Document) {
  const schemas = doc?.components?.schemas;

  if (!schemas) {
    return;
  }

  for (const [schemaName, schema] of Object.entries(schemas)) {
    createModel(doc, file, schemaName, schema as any);
  }
}