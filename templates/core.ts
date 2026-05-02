type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface BaseOperation {
  parameters?: {
    query?: Record<string, unknown>;
    path?: Record<string, string>;
    header?: Record<string, string>;
  }
  requestBody?: Record<string, any>;
  responses?: Record<string | number, {
    headers?: Record<string, Record<string, any>>;
    content?: Record<string, any>
  }>;
}

type ApiDoc = Record<string, Partial<BaseOperation & Record<HttpMethod, BaseOperation>>>;

type BaseRequest = {
  path?: Record<string, string>;
  query?: Record<string, string>;
  header?: Record<string, string>;
  contentType?: string;
  body?: any;
}

type Pretty<T> = {
  [K in keyof T]: T[K];
};

export type QueryParams<Api extends ApiDoc, Path extends keyof Api, Method extends keyof Api[Path]> = Api[Path][Method] extends { parameters: infer P } ? P : never
export type ResponseStatus<Api extends ApiDoc, Path extends keyof Api, Method extends keyof Api[Path], Status extends keyof Api[Path][Method]['responses']> = Api[Path][Method]['responses'][Status]