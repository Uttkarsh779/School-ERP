import { useMemo, useState } from "react";
import { IMAGES } from "./content";
import { GalleryTile, Lightbox, PageBanner, cx } from "./parts";
import { usePageTitle, useSite } from "./useSite";
import s from "./site.module.css";

const GalleryPage = () => {
  const { settings, gallery } = useSite();
  const [category, setCategory] = useState("All");
  const [lightbox, setLightbox] = useState<number | null>(null);
  usePageTitle("Photo Gallery", settings.schoolName);

  const categories = useMemo(() => ["All", ...Array.from(new Set(gallery.map((g) => g.category)))], [gallery]);
  const items = category === "All" ? gallery : gallery.filter((g) => g.category === category);

  return (
    <>
      <PageBanner crumb="Gallery" title="Photo Gallery" text="Classrooms, labs, sports, celebrations and everyday moments at our school." image={IMAGES.auditorium} />

      <section className={s.section}>
        <div className={s.container}>
          {categories.length > 2 && (
            <div className={s.filters} role="tablist" aria-label="Photo categories">
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={category === c}
                  className={cx(s.filterBtn, category === c && s.filterBtnActive)}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {items.length > 0 ? (
            <div className={s.galleryGrid}>
              {items.map((g, i) => (
                <GalleryTile key={g.id} item={g} onOpen={() => setLightbox(i)} />
              ))}
            </div>
          ) : (
            <div className={s.empty}>No photos in this category yet.</div>
          )}
        </div>
        {lightbox !== null && <Lightbox items={items} index={lightbox} onIndex={setLightbox} onClose={() => setLightbox(null)} />}
      </section>
    </>
  );
};

export default GalleryPage;
