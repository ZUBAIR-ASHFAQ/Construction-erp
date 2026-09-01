-- Pass 91 / Stage 3: harden approval definition activation and core relationship integrity.
-- Service logic validates active approvers before activation; these constraints protect persisted state.

-- Composite identity lets approval requests prove that company and snapshotted version match the definition.
CREATE UNIQUE INDEX "approval_definitions_id_company_version_uq"
    ON "approval_definitions"("id", "company_id", "version_no");

ALTER TABLE "approval_definitions"
    ADD CONSTRAINT "approval_definitions_status_allowed"
        CHECK ("status" IN ('DRAFT', 'ACTIVE', 'INACTIVE')),
    ADD CONSTRAINT "approval_definitions_conditions_array"
        CHECK (jsonb_typeof("condition_json") = 'array');

ALTER TABLE "approval_steps"
    ADD CONSTRAINT "approval_steps_approver_type_allowed"
        CHECK ("approver_type" IN ('USER', 'ROLE')),
    ADD CONSTRAINT "approval_steps_user_single_approval"
        CHECK ("approver_type" <> 'USER' OR "min_approvals" = 1),
    ADD CONSTRAINT "approval_steps_conditions_array"
        CHECK ("condition_json" IS NULL OR jsonb_typeof("condition_json") = 'array');

ALTER TABLE "approval_requests"
    ADD CONSTRAINT "approval_requests_status_allowed"
        CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'EXPIRED')),
    ADD CONSTRAINT "approval_requests_payload_object"
        CHECK (jsonb_typeof("payload_snapshot_json") = 'object'),
    ADD CONSTRAINT "approval_requests_status_completion_consistent"
        CHECK (
            ("status" = 'PENDING' AND "completed_at" IS NULL)
            OR ("status" IN ('APPROVED', 'REJECTED', 'RETURNED', 'EXPIRED') AND "completed_at" IS NOT NULL)
        ),
    ADD CONSTRAINT "approval_requests_definition_company_version_fkey"
        FOREIGN KEY ("definition_id", "company_id", "definition_version")
        REFERENCES "approval_definitions"("id", "company_id", "version_no")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "approval_requests_requester_company_fkey"
        FOREIGN KEY ("requested_by", "company_id")
        REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "approval_requests_current_step_fkey"
        FOREIGN KEY ("definition_id", "current_step_no")
        REFERENCES "approval_steps"("definition_id", "step_no")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "approval_actions"
    ADD CONSTRAINT "approval_actions_action_allowed"
        CHECK ("action" IN ('APPROVE', 'REJECT', 'RETURN'));

ALTER TABLE "approval_delegations"
    ADD CONSTRAINT "approval_delegations_status_allowed"
        CHECK ("status" IN ('ACTIVE', 'INACTIVE')),
    ADD CONSTRAINT "approval_delegations_scope_object"
        CHECK (jsonb_typeof("scope_json") = 'object'),
    ADD CONSTRAINT "approval_delegations_from_user_company_fkey"
        FOREIGN KEY ("from_user_id", "company_id")
        REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "approval_delegations_to_user_company_fkey"
        FOREIGN KEY ("to_user_id", "company_id")
        REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;
