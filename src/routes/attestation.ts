import { Elysia, t } from "elysia";
import { isAddress } from "viem";
import { type AttestationService, toJson } from "../attestation/service";

// GET /attestation/:wallet → signed payload. The caller relays it to
// NanSigil.submit; any consuming contract then reads NanSigil.latest(wallet)
// and binds it to its own records (Custos: the agent's creator).
export const attestationRoutes = (service: AttestationService) =>
  new Elysia({ prefix: "/attestation" }).get(
    "/:wallet",
    async ({ params, status }) => {
      if (!isAddress(params.wallet)) return status(400, { error: "invalid wallet address" });
      return toJson(await service.attest(params.wallet));
    },
    { params: t.Object({ wallet: t.String() }) },
  );
