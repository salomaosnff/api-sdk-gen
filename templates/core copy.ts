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

type DeepPretty<T> = T extends object ? Pretty<{
  [K in keyof T]: DeepPretty<T[K]>;
}> : T;

type GetOp<T extends ApiDoc, P extends keyof T, M extends keyof T[P] & HttpMethod> =
  T[P][M] extends infer Op ? (Op extends BaseOperation ? Op : never) : never;

type RequiredKeys<T> = { [K in keyof T]-?: (Record<string, never>) extends Pick<T, K> ? never : K }[keyof T];

type OptionalIfEmpty<K extends string, T> =
  [T] extends [never] ? unknown :
  [T] extends [undefined] ? unknown :
  RequiredKeys<T> extends never
  ? (keyof T extends never ? unknown : { [P in K]?: T })
  : { [P in K]: T };

type OpBody<Op extends BaseOperation> =
  Op['requestBody'] extends infer RB
  ? RB extends Record<string, unknown>
  ? { [K in keyof RB]: {
    contentType: K,
    body: K extends 'multipart/form-data' ? (RB[K] | FormData) : RB[K]
  } }[keyof RB]
  : unknown
  : unknown;

type ToNumber<S> = S extends number ? S : S extends `${infer N extends number}` ? N : S;

type ApiFetchResponse<Op extends BaseOperation> =
  Op['responses'] extends infer R
  ? R extends Record<string | number, any>
  ? {
    [S in keyof R]: S extends number | string
    ? R[S] extends { content: infer C }
    ? C extends Record<string, any>
    ? { [CT in keyof C]: {
      status: ToNumber<S>,
      contentType: CT,
      body: C[CT]
    } }[keyof C]
    : { status: ToNumber<S>, contentType: null, body: null }
    : { status: ToNumber<S>, contentType: null, body: null }
    : never
  }[keyof R]
  : { status: number; contentType: string; body: any }
  : { status: number; contentType: string; body: any };

type ApiFetchOptions<T extends ApiDoc, P extends keyof T, M extends keyof T[P] & HttpMethod, Op = GetOp<T, P, M>> =
  { method: M } &
  (Op extends BaseOperation ?
    OptionalIfEmpty<'path', NonNullable<Op['parameters']>['path']> &
    OptionalIfEmpty<'query', NonNullable<Op['parameters']>['query']> &
    OptionalIfEmpty<'header', NonNullable<Op['parameters']>['header']> &
    OpBody<Op>
    : unknown);

type ApiFetch<T extends ApiDoc> = <
  P extends keyof T,
  M extends keyof T[P] & HttpMethod
>(
  path: P,
  options: ApiFetchOptions<T, P, M>
) => Promise<DeepPretty<ApiFetchResponse<GetOp<T, P, M>>>>;

export type Request = {
  url: URL;
  init: RequestInit;
}

export function buildApiRequest(
  baseUrl: string | URL,
  path: string,
  options: BaseRequest
): Request {
  const headers = new Headers();
  const opts = options as any;
  let body: any = opts.body;
  const url = new URL(path as string, baseUrl);

  if (opts.header) {
    Object.entries(opts.header).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => {
          headers.append(key, v)
        });
      } else {
        headers.set(key, value as string);
      }
    });
  }

  if (opts.body) {
    headers.append('Content-Type', opts.contentType);

    if (opts.contentType === 'application/json') {
      body = JSON.stringify(body);
    } else if (opts.contentType === 'multipart/form-data' && !(body instanceof FormData)) {
      const form = new FormData();

      Object.entries(body).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          value.forEach(v => {
            form.append(key, v)
          });
        } else {
          form.set(key, value as string);
        }
      });

      body = form;
    } else if (opts.contentType === 'application/x-www-form-urlencoded') {
      body = new URLSearchParams(body);
    }
  }

  if (opts.path) {
    url.pathname = url.pathname.replace(/\{(.+?)\}/g, (text, key) => key in opts.path ? opts.path[key] : text);
  }

  if (opts.query) {
    Object.entries(opts.query).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach(v => {
          url.searchParams.append(key, v)
        });
      } else {
        url.searchParams.set(key, value as string);
      }
    });
  }

  return {
    url,
    init: {
      method: opts.method.toUpperCase(),
      headers,
      body,
    }
  };
}

export async function buildResponse<T extends ApiFetchResponse<any>>(response: Response): Promise<T> {
  const contentType = response.headers.get('Content-Type') || null;

  if (contentType?.startsWith('application/json')) {
    return {
      status: response.status,
      contentType,
      body: await response.json(),
    } as T;
  }

  if (contentType?.startsWith('application/xml')) {
    return {
      status: response.status,
      contentType,
      body: new DOMParser().parseFromString(await response.text(), 'application/xml'),
    } as T;
  }

  if (contentType?.startsWith('text/plain')) {
    return {
      status: response.status,
      contentType,
      body: await response.text(),
    } as T;
  }

  return {
    status: response.status,
    contentType,
    body: await response.blob(),
  } as T;
}

export function createApi<T extends ApiDoc>(
  baseUrl: string | URL,
  adapter?: (request: Request) => Promise<Response>
) {
  adapter ??= (request) => fetch(request.url, request.init);

  const api = async (path: string, options: any) => buildResponse(await adapter(buildApiRequest(baseUrl, path, options)));

  return api as ApiFetch<T>;
}