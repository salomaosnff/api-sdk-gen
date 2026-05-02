import { OpenAPIV3_1 } from "openapi-types";
import { resolveSchema } from "./util";
import { WriterFunction } from "ts-morph";

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
    } else if (schema.anyOf || schema.oneOf) {
      (schema.anyOf || schema.oneOf)?.forEach((subSchema, index) => {
        if (index > 0) {
          writer.write(" | ");
        }
        schemaToTypeLiteral(subSchema, doc, refPrefix)(writer);
      });
    } else if (schema.type) {
      switch (schema.type) {
        case "object": {
          const requiredProps = new Set(schema.required || []);
          writer.write("{").newLine();
          for (const [propName, propSchema] of Object.entries(
            schema.properties || {},
          )) {
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
          writer.write("}");
          break;
        }
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
