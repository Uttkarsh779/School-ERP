import { Link, useParams } from "react-router-dom";
import styles from "./ProjectsPage.module.css";
import { useGetListpageBySlugQuery } from "../../store/services/listpage.api";
import { useGetMainMenuBySlugQuery } from "../../store/services/mainMenu.api";

const ProjectsPage = () => {
  const { id } = useParams();

  const { data, isLoading } = useGetListpageBySlugQuery(String(id));
  const { data: mainMenuData, isLoading: mainMenuLoading } =
    useGetMainMenuBySlugQuery(String(id));

  const _data: any = data;
  const _mainMenuData: any = mainMenuData;

  console.log(_mainMenuData?.data);
  return (
    <div className={styles.container}>
      {/* Left Column - Projects */}
      {!mainMenuLoading && (
        <div className={styles.leftColumn}>
          <h1 className={styles.mainTitle}>{_mainMenuData?.data?.name}</h1>
          <ul className={styles.projectList}>
            {_mainMenuData?.data?.subMenu?.map((project: any) => (
              <li key={project.id} className={styles.projectItem}>
                <Link
                  to={`/project/${project.slug}`}
                  className={styles.projectLink}
                >
                  {project.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Right Column - SOPs */}
      {!isLoading && (
        <div className={styles.rightColumn}>
          <h2 className={styles.sectionTitle}>{_data?.data?.title || ""}</h2>
          <img
            src={import.meta.env.VITE_BACKEND_SERVER + _data?.data?.image}
            alt={_data?.data?.title || "Project Image"}
          />
          <p>{_data?.data?.description || "No Page Found"}</p>
        </div>
      )}
    </div>
  );
};

export default ProjectsPage;
