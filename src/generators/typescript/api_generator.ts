import { OpenAPIV3_1 } from "openapi-types";
import { SourceFile } from "ts-morph";
import { Config } from "../../types/config";
import { schemaToTypeLiteral } from "./schema_to_ts";

export async function generateApiType(file: SourceFile, config: Config, doc: OpenAPIV3_1.Document) {
  file.addImportDeclaration({
    moduleSpecifier: './models',
    namespaceImport: 'Models',
    isTypeOnly: true
  });

  file.addTypeAlias({
    name: 'Api',
    isExported: true,
    type: (writer) => {
      writer.write('{').newLine();
      for (const [path, pathItem] of Object.entries(doc.paths || {})) {
        if (!pathItem) continue;

        writer.indent(() => {
          writer.write(`'${path}': {`).newLine();
          writer.indent(() => {
            const methods = ['get', 'post', 'put', 'patch', 'delete'] as const;
            for (const method of methods) {
              const operation = pathItem[method];
              if (!operation) continue;

              writer.write(`${method}: {`).newLine();
              writer.indent(() => {
                // Parameters
                const allParams = [...(pathItem.parameters || []), ...(operation.parameters || [])];
                const queryParams = allParams.filter((p): p is OpenAPIV3_1.ParameterObject => !('$ref' in p) && p.in === 'query');
                const pathParams = allParams.filter((p): p is OpenAPIV3_1.ParameterObject => !('$ref' in p) && p.in === 'path');
                const headerParams = allParams.filter((p): p is OpenAPIV3_1.ParameterObject => !('$ref' in p) && p.in === 'header');

                if (queryParams.length || pathParams.length || headerParams.length) {
                  writer.write('parameters: {').newLine();
                  writer.indent(() => {
                    if (pathParams.length) {
                      writer.write('path: {').newLine();
                      writer.indent(() => {
                        for (const p of pathParams) {
                          writer.write(`'${p.name}'${p.required ? '' : '?'}: `);
                          if (p.schema) schemaToTypeLiteral(p.schema, doc, 'Models.')(writer);
                          else writer.write('any');
                          writer.write(';').newLine();
                        }
                      });
                      writer.write('},').newLine();
                    }
                    if (queryParams.length) {
                      writer.write('query: {').newLine();
                      writer.indent(() => {
                        for (const p of queryParams) {
                          writer.write(`'${p.name}'${p.required ? '' : '?'}: `);
                          if (p.schema) schemaToTypeLiteral(p.schema, doc, 'Models.')(writer);
                          else writer.write('any');
                          writer.write(';').newLine();
                        }
                      });
                      writer.write('},').newLine();
                    }
                    if (headerParams.length) {
                      writer.write('header: {').newLine();
                      writer.indent(() => {
                        for (const p of headerParams) {
                          writer.write(`'${p.name}'${p.required ? '' : '?'}: `);
                          if (p.schema) schemaToTypeLiteral(p.schema, doc, 'Models.')(writer);
                          else writer.write('any');
                          writer.write(';').newLine();
                        }
                      });
                      writer.write('},').newLine();
                    }
                  });
                  writer.write('},').newLine();
                }

                // Request Body
                if (operation.requestBody && !('$ref' in operation.requestBody)) {
                  const rb = operation.requestBody as OpenAPIV3_1.RequestBodyObject;
                  writer.write('requestBody: {').newLine();
                  writer.indent(() => {
                    for (const [contentType, mediaType] of Object.entries(rb.content || {})) {
                      writer.write(`'${contentType}': `);
                      const mt = mediaType as OpenAPIV3_1.MediaTypeObject;
                      if (mt.schema) schemaToTypeLiteral(mt.schema, doc, 'Models.')(writer);
                      else writer.write('any');
                      writer.write(';').newLine();
                    }
                  });
                  writer.write('},').newLine();
                }

                // Responses
                if (operation.responses) {
                  writer.write('responses: {').newLine();
                  writer.indent(() => {
                    for (const [status, response] of Object.entries(operation.responses)) {
                      if ('$ref' in response) continue;
                      const res = response as OpenAPIV3_1.ResponseObject;
                      writer.write(`'${status}': {`).newLine();
                      writer.indent(() => {
                        if (res.content) {
                          writer.write('content: {').newLine();
                          writer.indent(() => {
                            for (const [contentType, mediaType] of Object.entries(res.content || {})) {
                              writer.write(`'${contentType}': `);
                              const mt = mediaType as OpenAPIV3_1.MediaTypeObject;
                              if (mt.schema) schemaToTypeLiteral(mt.schema, doc, 'Models.')(writer);
                              else writer.write('any');
                              writer.write(';').newLine();
                            }
                          });
                          writer.write('}').newLine();
                        }
                      });
                      writer.write('},').newLine();
                    }
                  });
                  writer.write('},').newLine();
                }
              });
              writer.write('},').newLine();
            }
          });
          writer.write('},').newLine();
        });
      }
      writer.write('}');
    }
  });
}
