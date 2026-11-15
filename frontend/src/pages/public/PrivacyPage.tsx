import { IMAGES } from "./content";
import { PageBanner, cx } from "./parts";
import { usePageTitle, useSite } from "./useSite";
import s from "./site.module.css";
import NoticeText from "../../components/shared/Privacy/NoticeText";
import { useGetPrivacyNoticeQuery } from "../../store/api/privacy.api";

// The school's privacy notice (DPDP Act), edited by the Super Admin in Settings -> Privacy.
const PrivacyPage = () => {
  const { settings } = useSite();
  usePageTitle("Privacy Notice", settings.schoolName);
  const { data, isLoading, isError } = useGetPrivacyNoticeQuery();

  return (
    <>
      <PageBanner crumb="Privacy" title="Privacy Notice" text="How we use and protect the personal data of our students and their families." image={IMAGES.campusHero} />
      <section className={s.section}>
        <div className={cx(s.container)} style={{ maxWidth: 820 }}>
          {isLoading ? (
            <p>Loading…</p>
          ) : isError || !data ? (
            <p>The privacy notice couldn't be loaded. Please contact the school office.</p>
          ) : (
            <>
              <NoticeText text={data.noticeText} />
              <h3 style={{ margin: "1.5rem 0 0.4rem", fontSize: "1.02rem" }}>Grievance officer</h3>
              {data.grievanceName || data.grievanceEmail || data.grievancePhone ? (
                <p style={{ margin: 0, lineHeight: 1.7 }}>
                  {data.grievanceName && <><strong>{data.grievanceName}</strong><br /></>}
                  {data.grievanceEmail && <><a href={`mailto:${data.grievanceEmail}`}>{data.grievanceEmail}</a><br /></>}
                  {data.grievancePhone && <a href={`tel:${data.grievancePhone.replace(/[^\d+]/g, "")}`}>{data.grievancePhone}</a>}
                </p>
              ) : (
                <p style={{ margin: 0 }}>Please contact the school office.</p>
              )}
              <p style={{ marginTop: "1.5rem", fontSize: "0.85rem", opacity: 0.75 }}>
                Version {data.noticeVersion} · last updated {new Date(data.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            </>
          )}
        </div>
      </section>
    </>
  );
};

export default PrivacyPage;
