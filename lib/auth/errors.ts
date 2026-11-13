import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required.") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission for this organization.") {
    super(message, 403, "FORBIDDEN");
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request.") {
    super(message, 400, "BAD_REQUEST");
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ConflictError extends AppError {
  constructor(message = "Resource already exists.") {
    super(message, 409, "CONFLICT");
  }
}

export interface PlanLimitDetails {
  limitKey:
    "shippingBillsPerMonth" | "maxIecs" | "teamSeats" | "canGenerateEbrc" | "canExportReports";
  currentUsage: number;
  limit: number;
  currentPlanKey: string;
  recommendedPlanKey: string;
}

export class PlanLimitError extends AppError {
  readonly details: PlanLimitDetails;

  constructor(message: string, details: PlanLimitDetails) {
    super(message, 402, "PLAN_LIMIT_EXCEEDED");
    this.details = details;
  }
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof PlanLimitError) {
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status }
    );
  }

  if (error instanceof AppError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status }
    );
  }

  if (error instanceof ZodError) {
    const firstIssue = error.issues[0];
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: firstIssue?.message ?? "Invalid request payload.",
        },
      },
      { status: 400 }
    );
  }

  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." } },
    { status: 500 }
  );
}
