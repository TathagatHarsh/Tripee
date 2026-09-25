import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MakeYourCakes",
    short_name: "MakeYourCakes",
    description: "Cakes baked to order in Jubilee Hills, Hyderabad.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf7ef",
    theme_color: "#faf7ef",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
