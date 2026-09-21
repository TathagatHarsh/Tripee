/**
 * Features that are built, kept, and switched off.
 *
 * ## The 3D builder
 *
 * The nine-step 3D cake builder under `/build` is complete and is NOT being
 * removed — every file, component, scene, shader and test that makes it work is
 * still in the tree, untouched. Phase 1 of the storefront redesign holds it back
 * from customers while the shop is the product, and presents it as an upcoming
 * feature instead.
 *
 * One flag, read in one gate (app/build/layout.tsx), so there is exactly one
 * answer to "can a customer get into the builder" and it cannot be routed
 * around by knowing a step's URL: every one of the nine steps is a child of that
 * layout, and so is `/build` itself.
 *
 * ### Turning it back on
 *
 *   NEXT_PUBLIC_BUILDER_ENABLED=true
 *
 * in the environment, and redeploy. Nothing else has to change: the gate falls
 * away, `/build/shape` … `/build/review` render exactly as they did before this
 * phase, and the storefront's "Coming Soon" card becomes a live link on its own
 * (see components/shop/BuilderComingSoon).
 *
 * `NEXT_PUBLIC_` because the answer is also needed in the browser — the cards
 * and the CTAs that point at the builder are client components, and a CTA that
 * offers a door the server will refuse is worse than no CTA.
 *
 * Default off. An unset variable means the builder is held back, which is the
 * state this phase ships in; opting *in* has to be deliberate.
 */
export const BUILDER_ENABLED =
  process.env.NEXT_PUBLIC_BUILDER_ENABLED === "true";
