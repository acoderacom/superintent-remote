import QRCode from "qrcode";

export async function qrToTerminal(text: string): Promise<string> {
  return await QRCode.toString(text, {
    type: "utf8",
    errorCorrectionLevel: "L",
  });
}
