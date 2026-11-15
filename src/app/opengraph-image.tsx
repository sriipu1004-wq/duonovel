import { ImageResponse } from "next/og";
import { DefaultOgImageElement } from "@/lib/og/ogImageElements";

export const alt = "LIB read | Long-form and web novels for multilingual reading";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<DefaultOgImageElement />, size);
}
