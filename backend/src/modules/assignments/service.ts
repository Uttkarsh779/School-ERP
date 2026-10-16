import { prisma } from "../../config/prisma";

export const listAssignments = async (classSectionId?: number, subjectId?: number) => {
  return prisma.assignment.findMany({
    where: {
      ...(classSectionId && { classSectionId }),
      ...(subjectId && { subjectId }),
    },
    include: {
      classSection: true,
      subject: true,
      assignedBy: {
        include: {
          user: true,
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });
};

export const getAssignmentById = async (id: number) => {
  return prisma.assignment.findUnique({
    where: { id },
    include: {
      classSection: true,
      subject: true,
      assignedBy: {
        include: {
          user: true,
        },
      },
    },
  });
};

export const createAssignment = async (data: {
  title: string;
  description: string;
  classSectionId: number;
  subjectId: number;
  assignedById: number;
  dueDate: Date;
  endDate: Date;
  attachmentUrl?: string;
}) => {
  return prisma.assignment.create({
    data: {
      title: data.title,
      description: data.description,
      classSectionId: data.classSectionId,
      subjectId: data.subjectId,
      assignedById: data.assignedById,
      dueDate: data.dueDate,
      endDate: data.endDate,
      attachmentUrl: data.attachmentUrl,
    },
    include: {
      classSection: true,
      subject: true,
      assignedBy: {
        include: {
          user: true,
        },
      },
    },
  });
};

export const deleteAssignment = async (id: number) => {
  return prisma.assignment.delete({
    where: { id },
  });
};
