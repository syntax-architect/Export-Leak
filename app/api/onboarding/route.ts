import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse, UnauthorizedError } from "@/lib/auth/errors";
import { getAuthenticatedUser } from "@/lib/auth/org-access";
import {
  getOrCreateOnboardingProfile,
  recordOnboardingEvent,
  updateOnboardingProgress,
} from "@/lib/onboarding/repository";
import { onboardingUpdateSchema } from "@/lib/validation/onboarding";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new UnauthorizedError();
    }
    const profile = await getOrCreateOnboardingProfile(user.id);
    return NextResponse.json({ profile });
  } catch (error) {
    return toErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      throw new UnauthorizedError();
    }

    const body = await request.json();
    const parsed = onboardingUpdateSchema.parse(body);

    const profile = await updateOnboardingProgress({
      userId: user.id,
      currentStep: parsed.currentStep,
      preferences: parsed.preferences,
      markCompleted: parsed.markCompleted,
      markSkipped: parsed.markSkipped,
      markTourCompleted: parsed.markTourCompleted,
      replayTour: parsed.replayTour,
      dismissChecklist: parsed.dismissChecklist,
    });

    if (parsed.eventType) {
      await recordOnboardingEvent({
        userId: user.id,
        orgId: profile.orgId,
        eventType: parsed.eventType,
        stepNumber: parsed.eventStep ?? parsed.currentStep ?? null,
        metadata: parsed.eventMetadata ?? {},
      });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    return toErrorResponse(error);
  }
}
