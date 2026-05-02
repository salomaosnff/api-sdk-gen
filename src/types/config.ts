import { OpenAPIV3_1 } from "openapi-types";

export interface Config {
  outputDir: string;
  url: string;
  api_base: string;
  getOperationId?: (operation: OpenAPIV3_1.OperationObject, tag: string) => string;
  getServiceName?: (tag: string) => string;
}