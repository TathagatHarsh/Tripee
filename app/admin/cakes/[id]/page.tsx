import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { removeCakePhoto, uploadCakePhoto } from "@/app/admin/cakes/actions";
import { CakeGalleryManager } from "@/components/admin/CakeGalleryManager";
import { CakeDelete } from "@/components/admin/CakeDelete";
import { CakeForm } from "@/components/admin/CakeForm";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { Icon } from "@/components/admin/icons";
import { aBtn, Card, CardHead, Notice, PageHeader } from "@/components/admin/ui";
import { cakeById, orderCountFor } from "@/lib/cakeData";
import { hasDatabase, NO_DATABASE_MESSAGE } from "@/lib/db";
import { hasImageStore, NO_IMAGE_STORE_MESSAGE } from "@/lib/storage";

/**
 * One cake, and everything an owner can change about it.
 *
 * Three panels in the order the work actually happens: the photograph, because
 * it is the thing somebody came here to swap; the details, because that is the
 * long form; and the dangerous one, kept at the bottom and visually separate.
 *
 * The "view in shop" link is a real link to the customer's own page. §25's
 * final check ends at "the updated cake appears in /shop", and the shortest
 * path to verifying that is a link from the thing you just saved.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Edit cake — Admin",
  robots: { index: false, follow: false },
};

export default async function EditCakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!hasDatabase()) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Cake" back={{ href: "/admin/cakes", label: "All cakes" }} />
        <Notice tone="warn">{NO_DATABASE_MESSAGE}</Notice>
      </div>
    );
  }

  const cake = await cakeById(id);
  if (!cake) notFound();

  /* What decides whether Delete is offered at all. The action checks it again
     for itself — a hidden button is not a rule, and the count can change
     between this render and the press. */
  const orders = await orderCountFor(cake.id);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title={cake.name}
        blurb={
          cake.isAvailable
            ? "On the shelf. Anything you save here reaches the shop on the next page load."
            : "Off the shelf. Customers cannot see or order this cake; orders already placed are unaffected."
        }
        back={{ href: "/admin/cakes", label: "All cakes" }}
      >
        {cake.isAvailable && (
          <Link
            href={`/cakes/${cake.slug}`}
            target="_blank"
            rel="noreferrer"
            className={aBtn("secondary", "md")}
          >
            View in shop
            <Icon name="external" size={14} />
          </Link>
        )}
      </PageHeader>

      <Card flush>
        <CardHead
          title="Cover photograph"
          note="Shown on the shop's cards, first on this cake's own page, and on every order placed from it."
        />
        <div className="p-4 sm:p-5">
          {!hasImageStore() ? (
            <Notice tone="warn">{NO_IMAGE_STORE_MESSAGE}</Notice>
          ) : null}
          {/*
            The same uploader the catalogue options use, pointed at this table.
            Five hundred lines of cropper, object-URL lifecycle and error
            handling, reused rather than rewritten — see its `PhotoAction` note.
          */}
          <ImageUploader
            id={cake.id}
            name={cake.name}
            imageUrl={cake.imageUrl}
            enabled={hasImageStore()}
            disabledReason={NO_IMAGE_STORE_MESSAGE}
            uploadAction={uploadCakePhoto}
            removeAction={removeCakePhoto}
          />
        </div>
      </Card>

      {/*
        The gallery, under the cover it belongs to.

        Only when there is somewhere to put the files: without a Blob store the
        panel above already says so, and repeating it here would be the same
        warning twice on one screen.
      */}
      {hasImageStore() && (
        <Card flush>
          <CardHead
            title="More photographs"
            note="Extra shots for this cake's own page. The cover above is always shown first."
          />
          <div className="p-4 sm:p-5">
            <CakeGalleryManager id={cake.id} name={cake.name} gallery={cake.gallery} />
          </div>
        </Card>
      )}

      <Card>
        <CakeForm cake={cake} />
      </Card>

      <Card className="border-a-bad-line">
        <CardHead
          title="Remove this cake"
          note={
            orders > 0
              ? `${orders} order${orders === 1 ? " names" : "s name"} this cake, so it can only be taken off the shelf.`
              : "Nobody has ordered this cake, so it can be deleted outright."
          }
        />
        <div className="p-4 sm:p-5">
          <CakeDelete id={cake.id} name={cake.name} orders={orders} />
        </div>
      </Card>
    </div>
  );
}
