-- Pass 90 / Stage 3: optional reminder, escalation, and expiry timing for approval steps.
-- Escalation is a durable notification signal only; it does not silently change approver authority.

ALTER TABLE "approval_steps"
    ADD COLUMN "reminder_after_minutes" INTEGER,
    ADD COLUMN "escalate_after_minutes" INTEGER,
    ADD COLUMN "expire_after_minutes" INTEGER;

ALTER TABLE "approval_steps"
    ADD CONSTRAINT "approval_steps_reminder_minutes_positive"
        CHECK ("reminder_after_minutes" IS NULL OR "reminder_after_minutes" BETWEEN 1 AND 43200),
    ADD CONSTRAINT "approval_steps_escalate_minutes_positive"
        CHECK ("escalate_after_minutes" IS NULL OR "escalate_after_minutes" BETWEEN 1 AND 43200),
    ADD CONSTRAINT "approval_steps_expire_minutes_positive"
        CHECK ("expire_after_minutes" IS NULL OR "expire_after_minutes" BETWEEN 1 AND 43200),
    ADD CONSTRAINT "approval_steps_reminder_before_escalation"
        CHECK (
            "reminder_after_minutes" IS NULL
            OR "escalate_after_minutes" IS NULL
            OR "reminder_after_minutes" < "escalate_after_minutes"
        ),
    ADD CONSTRAINT "approval_steps_reminder_before_expiry"
        CHECK (
            "reminder_after_minutes" IS NULL
            OR "expire_after_minutes" IS NULL
            OR "reminder_after_minutes" < "expire_after_minutes"
        ),
    ADD CONSTRAINT "approval_steps_escalation_before_expiry"
        CHECK (
            "escalate_after_minutes" IS NULL
            OR "expire_after_minutes" IS NULL
            OR "escalate_after_minutes" < "expire_after_minutes"
        );
