import {
  prepareOfficialSourceSyncBatch,
  type OfficialSourceWorkbookSnapshot,
  type PreparedSourceSyncBatch,
} from "../../application/source-sync-service";
import type { BankSourceContract } from "../../domain/bank-source-contract";
import {
  GoogleOfficialBankSourceReader,
  type GoogleAccessTokenProvider,
} from "./official-bank-source-reader";

export interface OpenbankPersonalSourceProfile
  extends BankSourceContract<OfficialSourceWorkbookSnapshot, PreparedSourceSyncBatch> {
  readonly id: "openbank-personal-v1";
  createReader(
    spreadsheetId: string,
    accessTokens: GoogleAccessTokenProvider,
  ): GoogleOfficialBankSourceReader;
}

export const OPENBANK_PERSONAL_SOURCE_PROFILE: OpenbankPersonalSourceProfile = {
  id: "openbank-personal-v1",
  displayName: "Openbank personal",
  readOnly: true,
  prepareSyncBatch: prepareOfficialSourceSyncBatch,
  createReader(spreadsheetId, accessTokens) {
    return new GoogleOfficialBankSourceReader(spreadsheetId, accessTokens);
  },
};
