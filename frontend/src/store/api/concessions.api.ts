import { erpApi } from "./erpApi";

export interface IConcessionScheme {
  id: number;
  name: string;
  type: string;
  calculationType: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  applicableHeads: number[];
  startsFrom?: string | null;
  endsOn?: string | null;
  configJson?: string | null;
  isActive: boolean;
}

export interface IStudentConcession {
  id: number;
  studentId: number;
  student: {
    name: string;
    classSection?: {
      className: string;
      section: string;
    };
  };
  concessionSchemeId?: number;
  concessionScheme?: IConcessionScheme;
  staffId?: number;
  staff?: {
    staffCategory: string;
    user?: {
      name: string;
    }
  };
  type: string;
  calculationType: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  applicableHeads: number[];
  startsFrom?: string | null;
  endsOn?: string | null;
  reason?: string;
  notes?: string;
  approvedByUser: {
    name: string;
  };
  status: string;
  createdAt: string;
}

export const concessionsApi = erpApi.injectEndpoints({
  endpoints: (builder) => ({
    getConcessionSchemes: builder.query<{ success: boolean; data: IConcessionScheme[] }, void>({
      query: () => "/concessions/schemes",
      providesTags: ["Concession"],
    }),
    getAllConcessions: builder.query<{ success: boolean; data: IStudentConcession[] }, void>({
      query: () => "/concessions/all",
      providesTags: ["Concession"],
    }),
    getStudentConcessions: builder.query<{ success: boolean; data: IStudentConcession[] }, number>({
      query: (studentId) => `/concessions/student/${studentId}`,
      providesTags: (_result, _error, id) => [{ type: "Concession", id }],
    }),
    assignStudentConcession: builder.mutation<{ success: boolean; data: IStudentConcession }, any>({
      query: (body) => ({
        url: "/concessions/assign",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Concession"],
    }),
    endStudentConcession: builder.mutation<{ success: boolean; data: IStudentConcession }, { id: number; effectiveDate: string }>({
      query: ({ id, effectiveDate }) => ({
        url: `/concessions/student-concession/${id}/end`,
        method: "PUT",
        body: { effectiveDate },
      }),
      invalidatesTags: ["Concession"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetConcessionSchemesQuery,
  useGetAllConcessionsQuery,
  useGetStudentConcessionsQuery,
  useAssignStudentConcessionMutation,
  useEndStudentConcessionMutation,
} = concessionsApi;
