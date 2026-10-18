import { OpenAPIV3_1 } from "openapi-types";
import { resolveSchema } from "./util";
import { CodeBlockWriter, WriterFunction } from "ts-morph";

export function schemaToTypeLiteral(
  schema: OpenAPIV3_1.SchemaObject | OpenAPIV3_1.ReferenceObject,
  doc: OpenAPIV3_1.Document,
  refPrefix?: string,
): WriterFunction {
  return (writer) => {
    if ("$ref" in schema) {
      writer.write((refPrefix ?? "") + resolveSchema(schema.$ref));
    } else if (schema.enum) {
      writer.write(
        schema.enum.map((value) => JSON.stringify(value)).join(" | "),
      );
    } else if (schema.allOf && schema.allOf.length > 0) {
      const uniqueTypes = new Set<string>();
      for (const subSchema of schema.allOf) {
        const subWriter = new CodeBlockWriter();
        schemaToTypeLiteral(subSchema, doc, refPrefix)(subWriter);
        const str = subWriter.toString().trim();
        if (str) uniqueTypes.add(str);
      }
      const typesArray = Array.from(uniqueTypes);
      if (typesArray.length > 1) {
        writer.write("(");
        writer.write(typesArray.join(" & "));
        writer.write(")");
      } else if (typesArray.length === 1) {
        writer.write(typesArray[0]);
      } else {
        writer.write("unknown");
      }
    } else if (schema.anyOf || schema.oneOf) {
      const items = schema.anyOf || schema.oneOf;
      if (items && items.length > 0) {
        const uniqueTypes = new Set<string>();
        for (const subSchema of items) {
          const subWriter = new CodeBlockWriter();
          schemaToTypeLiteral(subSchema, doc, refPrefix)(subWriter);
          const str = subWriter.toString().trim();
          if (str) uniqueTypes.add(str);
        }
        const typesArray = Array.from(uniqueTypes);
        if (typesArray.length > 1) {
          writer.write("(");
          writer.write(typesArray.join(" | "));
          writer.write(")");
        } else if (typesArray.length === 1) {
          writer.write(typesArray[0]);
        } else {
          writer.write("unknown");
        }
      }
    } else if (schema.type === "object" || (!schema.type && schema.properties)) {
      const properties = schema.properties || {};
      const propEntries = Object.entries(properties);

      if (propEntries.length === 0) {
        if (
          schema.additionalProperties &&
          typeof schema.additionalProperties === "object" &&
          Object.keys(schema.additionalProperties).length > 0
        ) {
          writer.write("Record<string, ");
          schemaToTypeLiteral(schema.additionalProperties as any, doc, refPrefix)(writer);
          writer.write(">");
        } else {
          writer.write("Record<string, unknown>");
        }
      } else {
        const requiredProps = new Set(schema.required || []);
        writer.write("{").newLine();
        for (const [propName, propSchema] of propEntries) {
          writer.indent(() => {
            writer.write(propName);
            if (!requiredProps.has(propName)) {
              writer.write("?");
            }
            writer.write(": ");
            schemaToTypeLiteral(propSchema, doc, refPrefix)(writer);
            writer.write(";").newLine();
          });
        }
        if (schema.additionalProperties) {
          writer.indent(() => {
            writer.write("[k: string]: unknown;").newLine();
          });
        }
        writer.write("}");
      }
    } else if (schema.type) {
      switch (schema.type) {
        case "array":
          if (Array.isArray(schema.items)) {
            writer.write("[");
            schema.items.forEach((itemSchema, index) => {
              if (index > 0) {
                writer.write(", ");
              }
              schemaToTypeLiteral(itemSchema, doc, refPrefix)(writer);
            });
            writer.write("]");
          } else if (schema.items) {
            writer.write("Array<");
            schemaToTypeLiteral(schema.items, doc, refPrefix)(writer);
            writer.write(">");
          } else {
            writer.write("any[]");
          }
          break;
        case "string": {
          const s = schema as any;

          if (s.format === "date-time" || s.format === "date") {
            writer.write("Date | string");
            break;
          }

          const isFile =
            s.format === "binary" ||
            s.format === "base64" ||
            s.contentMediaType;

          if (isFile) {
            writer.write("File | Blob");
            break;
          }

          writer.write(s.type);
          break;
        }
        case "number":
        case "boolean":
        case "null":
          writer.write(schema.type);
          break;
        case "integer":
          writer.write("number");
          break;
        default:
          writer.write("any");
      }
    } else {
      writer.write("unknown");
    }

    if ("nullable" in schema && schema.nullable) {
      writer.write(" | null");
    }
  };
}
