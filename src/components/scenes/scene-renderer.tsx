import { sceneDef } from "@/lib/scenes/registry";
import type { Scene, SceneContext } from "@/lib/scenes/types";
import { useSceneContextWithPicked } from "@/lib/scenes/scene-products";
import { PageBackgroundContext } from "./page-background-context";
import { PageSound, type PageSoundConfig } from "./page-sound";

export function SceneRenderer({ scenes, ctx, background = "ivory", sound }: { scenes: Scene[]; ctx: SceneContext; background?: string; sound?: PageSoundConfig | null }) {
  const fullCtx = useSceneContextWithPicked(scenes, ctx, true);
  return (
    <PageBackgroundContext.Provider value={background}>
      {scenes
        .filter((s) => s.visible)
        .sort((a, b) => a.position - b.position)
        .map((s) => (
          <SceneView key={s.id} scene={s} ctx={fullCtx} />
        ))}
      <PageSound sound={sound} />
    </PageBackgroundContext.Provider>
  );
}

export function resolvedSceneProps(scene: Scene) {
  const def = sceneDef(scene.type);
  const props = { ...def?.defaults, ...scene.props };

  if (scene.type === "products" && !Object.prototype.hasOwnProperty.call(scene.props, "source")) {
    const productIds = Array.isArray(scene.props.productIds) ? scene.props.productIds.filter(Boolean) : [];
    if (scene.props.collectionSlug) props.source = "collection";
    else if (productIds.length > 0) props.source = "manual";
  }

  return props;
}

export function SceneView({ scene, ctx }: { scene: Scene; ctx: SceneContext }) {
  const def = sceneDef(scene.type);
  if (!def) return null;
  const Component = def.Component;
  return <Component props={resolvedSceneProps(scene)} layers={scene.layers ?? []} ctx={ctx} />;
}
