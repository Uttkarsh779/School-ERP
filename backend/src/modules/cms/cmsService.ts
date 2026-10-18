import { prisma } from "../../config/prisma";

const DEFAULT_SETTINGS = {
  id: 1,
  schoolName: "Delhi Public Academy",
  tagline: "Empowering Minds, Inspiring Excellence",
  heroTitle: "Welcome to Excellence in Modern Education",
  heroSubtitle: "Nurturing global citizens with world-class academics, strong values, and state-of-the-art infrastructure.",
  aboutText: "Delhi Public Academy is committed to fostering academic brilliance, character development, and holistic innovation. Established with a visionary approach, our campus provides an inspiring atmosphere where every child discovers their unique talents and excels in a rapidly changing world.",
  principalName: "Dr. S. K. Sharma",
  principalMessage: "Education is not just about academic scores; it is the ignition of curiosity, empathy, and resilience. At our academy, we empower each student to dream boldly, think critically, and lead with compassion. We warmly invite you to be a part of our thriving school family.",
  affiliationNo: "CBSE-2130892",
  establishedYear: 1998,
  phone: "+91 98765 43210",
  email: "admissions@dpa-school.edu.in",
  address: "Sector 14, Knowledge Park, New Delhi, India - 110001",
  admissionsOpen: true,
  admissionNotice: "Admissions open for Academic Session 2026-27 from Nursery to Grade XII. Scholarships available for merit achievers.",
  heroCtaText: "Apply for Admission",
  heroCtaLink: "#admissions",
};

const DEFAULT_FACILITIES = [
  {
    title: "Smart Digital Classrooms",
    description: "Interactive smart boards, high-speed connectivity, and ergonomic acoustic setups for engaging visual learning.",
    iconName: "building",
    order: 1,
    isActive: true,
  },
  {
    title: "Advanced STEM & Computer Labs",
    description: "Cutting-edge physics, chemistry, biology, robotics, and coding labs with hands-on experimentation kits.",
    iconName: "layers",
    order: 2,
    isActive: true,
  },
  {
    title: "Sports Complex & Athletic Track",
    description: "Dedicated courts for basketball, badminton, football turf, cricket nets, and indoor games supervised by NIS coaches.",
    iconName: "dashboard",
    order: 3,
    isActive: true,
  },
  {
    title: "Comprehensive Digital Library",
    description: "Over 15,000 physical volumes, research journals, e-book readers, and serene reading spaces for curious minds.",
    iconName: "graduationCap",
    order: 4,
    isActive: true,
  },
  {
    title: "GPS-Monitored Safe Transport",
    description: "Air-conditioned bus fleet equipped with real-time GPS tracking, speed governors, CCTV cameras, and trained female attendants.",
    iconName: "bus",
    order: 5,
    isActive: true,
  },
  {
    title: "Visual & Performing Arts Studio",
    description: "Acoustically treated auditorium, classical & western music rooms, dance studio, and pottery & fine arts creative workshop.",
    iconName: "users",
    order: 6,
    isActive: true,
  },
];

const DEFAULT_NOTICES = [
  {
    title: "Admission Open for Academic Session 2026-27",
    content: "Registrations are now open for Nursery through Grade XI. Prospective parents can submit the online enquiry form or visit the school admissions desk between 9:00 AM and 2:00 PM on all working days.",
    category: "Admission",
    isPinned: true,
    publishedAt: new Date(),
    isActive: true,
  },
  {
    title: "Annual Sports Meet & Athletic Championship",
    content: "The annual inter-house athletics tournament will be held on the school sports grounds. Parents are cordially invited to cheer the young athletes during the opening ceremony.",
    category: "Event",
    isPinned: false,
    publishedAt: new Date(),
    isActive: true,
  },
  {
    title: "CBSE Regional Science Exhibition Winners",
    content: "We proudly congratulate our Grade X and XII students for securing 1st prize in the National Science & Innovation Fair with their Automated Water Purification model.",
    category: "Academic",
    isPinned: false,
    publishedAt: new Date(),
    isActive: true,
  },
];

let tablesEnsured = false;
export const ensureCmsTables = async () => {
  if (tablesEnsured) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "WebsiteSetting" (
        "id" SERIAL PRIMARY KEY,
        "schoolName" TEXT NOT NULL DEFAULT 'Delhi Public Academy',
        "tagline" TEXT NOT NULL DEFAULT 'Empowering Minds, Inspiring Excellence',
        "heroTitle" TEXT NOT NULL DEFAULT 'Welcome to Excellence in Modern Education',
        "heroSubtitle" TEXT NOT NULL DEFAULT 'Nurturing global citizens with world-class academics, strong values, and advanced infrastructure.',
        "aboutText" TEXT NOT NULL,
        "principalName" TEXT NOT NULL DEFAULT 'Dr. S. K. Sharma',
        "principalMessage" TEXT NOT NULL,
        "affiliationNo" TEXT NOT NULL DEFAULT 'CBSE-2130892',
        "establishedYear" INTEGER NOT NULL DEFAULT 1998,
        "phone" TEXT NOT NULL DEFAULT '+91 98765 43210',
        "email" TEXT NOT NULL DEFAULT 'admissions@dpa-school.edu.in',
        "address" TEXT NOT NULL DEFAULT 'Sector 14, Knowledge Park, New Delhi, India - 110001',
        "admissionsOpen" BOOLEAN NOT NULL DEFAULT true,
        "admissionNotice" TEXT DEFAULT 'Admissions open for Academic Session 2026-27 from Nursery to Grade XII.',
        "heroCtaText" TEXT NOT NULL DEFAULT 'Apply for Admission',
        "heroCtaLink" TEXT NOT NULL DEFAULT '#admissions',
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS "WebsiteFacility" (
        "id" SERIAL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "description" TEXT NOT NULL,
        "iconName" TEXT NOT NULL DEFAULT 'building',
        "imageUrl" TEXT,
        "order" INTEGER NOT NULL DEFAULT 0,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS "WebsitePublicNotice" (
        "id" SERIAL PRIMARY KEY,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "category" TEXT NOT NULL DEFAULT 'General',
        "fileUrl" TEXT,
        "isPinned" BOOLEAN NOT NULL DEFAULT false,
        "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "isActive" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS "AdmissionInquiry" (
        "id" SERIAL PRIMARY KEY,
        "studentName" TEXT NOT NULL,
        "parentName" TEXT NOT NULL,
        "email" TEXT NOT NULL,
        "phone" TEXT NOT NULL,
        "gradeApplyingFor" TEXT NOT NULL,
        "currentSchool" TEXT,
        "message" TEXT,
        "status" TEXT NOT NULL DEFAULT 'NEW',
        "notes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    tablesEnsured = true;
  } catch (e) {
    console.warn("[CMS] Table ensure notice:", (e as any)?.message);
  }
};

export const getPublicWebsiteData = async () => {
  await ensureCmsTables();
  let settings: any = null;
  try {
    settings = await prisma.websiteSetting.findFirst();
  } catch (err) {
    // If table not populated yet
  }

  if (!settings) {
    try {
      settings = await prisma.websiteSetting.create({
        data: DEFAULT_SETTINGS,
      });
    } catch {
      settings = DEFAULT_SETTINGS;
    }
  }

  let facilities: any[] = [];
  try {
    facilities = await prisma.websiteFacility.findMany({
      where: { isActive: true },
      orderBy: { order: "asc" },
    });
  } catch {}

  if (facilities.length === 0) {
    try {
      for (const fac of DEFAULT_FACILITIES) {
        await prisma.websiteFacility.create({ data: fac });
      }
      facilities = await prisma.websiteFacility.findMany({
        where: { isActive: true },
        orderBy: { order: "asc" },
      });
    } catch {
      facilities = DEFAULT_FACILITIES;
    }
  }

  let notices: any[] = [];
  try {
    notices = await prisma.websitePublicNotice.findMany({
      where: { isActive: true },
      orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      take: 8,
    });
  } catch {}

  if (notices.length === 0) {
    try {
      for (const not of DEFAULT_NOTICES) {
        await prisma.websitePublicNotice.create({ data: not });
      }
      notices = await prisma.websitePublicNotice.findMany({
        where: { isActive: true },
        orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
      });
    } catch {
      notices = DEFAULT_NOTICES;
    }
  }

  return {
    settings,
    facilities,
    notices,
  };
};

export const getWebsiteSettings = async () => {
  let settings = await prisma.websiteSetting.findFirst();
  if (!settings) {
    settings = await prisma.websiteSetting.create({
      data: DEFAULT_SETTINGS,
    });
  }
  return settings;
};

export const updateWebsiteSettings = async (data: any) => {
  const existing = await getWebsiteSettings();
  const updated = await prisma.websiteSetting.update({
    where: { id: existing.id },
    data: {
      ...data,
      establishedYear: data.establishedYear ? Number(data.establishedYear) : existing.establishedYear,
      admissionsOpen: data.admissionsOpen !== undefined ? Boolean(data.admissionsOpen) : existing.admissionsOpen,
    },
  });
  return updated;
};

export const getFacilities = async (includeInactive = true) => {
  const where = includeInactive ? {} : { isActive: true };
  return await prisma.websiteFacility.findMany({
    where,
    orderBy: { order: "asc" },
  });
};

export const createFacility = async (data: any) => {
  return await prisma.websiteFacility.create({
    data: {
      title: data.title,
      description: data.description,
      iconName: data.iconName || "building",
      imageUrl: data.imageUrl || null,
      order: Number(data.order) || 0,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    },
  });
};

export const updateFacility = async (id: number, data: any) => {
  return await prisma.websiteFacility.update({
    where: { id },
    data: {
      ...data,
      order: data.order !== undefined ? Number(data.order) : undefined,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : undefined,
    },
  });
};

export const deleteFacility = async (id: number) => {
  return await prisma.websiteFacility.delete({ where: { id } });
};

export const getPublicNotices = async (includeInactive = true) => {
  const where = includeInactive ? {} : { isActive: true };
  return await prisma.websitePublicNotice.findMany({
    where,
    orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
  });
};

export const createPublicNotice = async (data: any) => {
  return await prisma.websitePublicNotice.create({
    data: {
      title: data.title,
      content: data.content,
      category: data.category || "General",
      fileUrl: data.fileUrl || null,
      isPinned: Boolean(data.isPinned),
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : new Date(),
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    },
  });
};

export const updatePublicNotice = async (id: number, data: any) => {
  return await prisma.websitePublicNotice.update({
    where: { id },
    data: {
      ...data,
      isPinned: data.isPinned !== undefined ? Boolean(data.isPinned) : undefined,
      isActive: data.isActive !== undefined ? Boolean(data.isActive) : undefined,
      publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
    },
  });
};

export const deletePublicNotice = async (id: number) => {
  return await prisma.websitePublicNotice.delete({ where: { id } });
};

export const submitAdmissionInquiry = async (data: {
  studentName: string;
  parentName: string;
  email: string;
  phone: string;
  gradeApplyingFor: string;
  currentSchool?: string;
  message?: string;
}) => {
  if (!data.studentName || !data.parentName || !data.phone || !data.gradeApplyingFor) {
    throw new Error("Student name, parent name, phone number, and grade are required.");
  }

  return await prisma.admissionInquiry.create({
    data: {
      studentName: data.studentName.trim(),
      parentName: data.parentName.trim(),
      email: data.email?.trim() || "",
      phone: data.phone.trim(),
      gradeApplyingFor: data.gradeApplyingFor.trim(),
      currentSchool: data.currentSchool?.trim() || null,
      message: data.message?.trim() || null,
      status: "NEW",
    },
  });
};

export const getAdmissionInquiries = async (status?: string) => {
  const where = status && status !== "ALL" ? { status } : {};
  return await prisma.admissionInquiry.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
};

export const updateInquiryStatus = async (id: number, status: string, notes?: string) => {
  return await prisma.admissionInquiry.update({
    where: { id },
    data: {
      status,
      notes: notes !== undefined ? notes : undefined,
    },
  });
};
