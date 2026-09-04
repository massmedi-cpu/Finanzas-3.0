import {
  ConfigurationRequestError,
  parseConfigurationApiCommand,
} from "../application/configuration-api-contract";
import type { FoundationCheck } from "./foundation-health";

const ACCOUNT_ID = "10000000-0000-4000-8000-000000000010";
const CATEGORY_ID = "20000000-0000-4000-8000-000000000010";
const CATEGORY_ID_2 = "20000000-0000-4000-8000-000000000011";

function rejected(input: unknown, code?: string) {
  try {
    parseConfigurationApiCommand(input);
    return false;
  } catch (error) {
    return (
      error instanceof ConfigurationRequestError &&
      (code === undefined || error.code === code)
    );
  }
}

export function runConfigurationContractChecks(): FoundationCheck[] {
  const validAccount = parseConfigurationApiCommand({
    operation: "account.create",
    draft: {
      name: "Cuenta contrato",
      institution: null,
      type: "checking",
      openingBalanceCents: 123456,
      lifecycle: "active",
      sortOrder: 0,
    },
  });

  const validMerge = parseConfigurationApiCommand({
    operation: "category.merge",
    sourceCategoryId: CATEGORY_ID,
    targetCategoryId: CATEGORY_ID_2,
  });

  return [
    {
      name: "configuration-api-valid-command",
      passed:
        validAccount.operation === "account.create" &&
        validAccount.draft.openingBalanceCents === 123456,
    },
    {
      name: "configuration-api-boolean-is-strict",
      passed: rejected(
        { operation: "account.archive", id: ACCOUNT_ID, archived: "false" },
        "invalid_boolean",
      ),
    },
    {
      name: "configuration-api-rejects-extra-fields",
      passed: rejected(
        {
          operation: "account.archive",
          id: ACCOUNT_ID,
          archived: false,
          destructiveDelete: true,
        },
        "unexpected_field",
      ),
    },
    {
      name: "configuration-api-rejects-duplicate-reorder-ids",
      passed: rejected(
        { operation: "account.reorder", orderedIds: [ACCOUNT_ID, ACCOUNT_ID] },
        "duplicate_id",
      ),
    },
    {
      name: "configuration-api-validates-merge-identities",
      passed:
        validMerge.operation === "category.merge" &&
        validMerge.sourceCategoryId === CATEGORY_ID &&
        rejected(
          {
            operation: "category.merge",
            sourceCategoryId: "not-an-id",
            targetCategoryId: CATEGORY_ID_2,
          },
          "invalid_id",
        ),
    },
  ];
}
