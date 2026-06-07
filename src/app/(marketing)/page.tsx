import { Hero } from "@/components/landing/hero";
import { Story } from "@/components/landing/story";
import { Ask } from "@/components/landing/ask";
import { Adapt } from "@/components/landing/adapt";
import { Sources } from "@/components/landing/sources";
import { Proof } from "@/components/landing/proof";
import { Close } from "@/components/landing/close";

/**
 * "The Page That Reads Back" — one document is the protagonist for the whole
 * scroll. It wakes, learns to see / talk / remember, asks you to prove recall,
 * adapts to how you read, absorbs any source, and turns to face you at the end.
 */
export default function Landing() {
  return (
    <main>
      <Hero />
      <Story />
      <Ask />
      <Adapt />
      <Sources />
      <Proof />
      <Close />
    </main>
  );
}
