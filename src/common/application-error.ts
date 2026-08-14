export interface ErrorDetail {
  readonly field?: string;
  readonly reason: string;
}

export class ApplicationError extends Error {
  public constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
    public readonly details: readonly ErrorDetail[] = [],
  ) {
    super(message);
    this.name = "ApplicationError";
  }
}
