import { toast } from "react-toastify";
import { useLazyGetPrintableReportCardsQuery } from "../../../store/api/exams.api";
import { printReportCards } from "./reportCardPrint";
import { usePrintSchool } from "./usePrintSchool";

// Fetches the printable report card(s) and opens the print dialog. Without studentId it
// prints the whole class (admins and the class teacher).
export const usePrintReportCards = () => {
  const schoolFor = usePrintSchool();
  const [fetchCards, { isFetching }] = useLazyGetPrintableReportCardsQuery();

  const print = async (args: { examId: number; studentId?: number }) => {
    try {
      const set = await fetchCards(args).unwrap();
      if (set.cards.length === 0) {
        toast.info("No marks have been entered for this exam yet.");
        return;
      }
      printReportCards(set, schoolFor("reportCard"));
    } catch (err: any) {
      toast.error(err?.data?.message ?? "Couldn't load the report card for printing.");
    }
  };

  return { print, isPrinting: isFetching };
};
