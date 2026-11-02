// #137 NONPRODUCTION experimental processing-capacity gate. Not a safe
// Production capacity recommendation or an assertion of 1GiB support.
export function decideHumanProcessingTrialCapacity(
 bytes: number, rawCap: string | undefined, isolatedLocal: boolean
): { status: "inactive" | "allowed" | "exceeded" | "invalid"; capBytes: number | null } {
 if (!isolatedLocal || rawCap === undefined)
  return {status:"inactive",capBytes:null};
 if (!/^[1-9][0-9]*$/.test(rawCap))
  return {status:"invalid",capBytes:null};
 const capBytes=Number(rawCap);
 if (!Number.isSafeInteger(capBytes)||capBytes<=4*1024*1024||
     capBytes>1024*1024*1024||!Number.isSafeInteger(bytes)||bytes<0)
  return {status:"invalid",capBytes:null};
 return {status:bytes>capBytes?"exceeded":"allowed",capBytes};
}
