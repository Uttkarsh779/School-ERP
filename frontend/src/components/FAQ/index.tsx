// // import React, { useState } from 'react';
// // import { motion, AnimatePresence } from 'framer-motion';
// // import styles from './FAQ.module.css';

// // interface FAQItem {
// //   id: number;
// //   question: string;
// //   answer: string;
// // }

// // const faqData: FAQItem[] = [
// //   {
// //     id: 1,
// //     question: "What is a Loan Against Mutual Funds (LAMF)?",
// //     answer: "A Loan Against Mutual Funds (LAMF) is a secured loan where you can pledge your mutual fund units as collateral to get instant liquidity without selling your investments. This allows you to continue benefiting from potential market growth while accessing funds for your immediate needs."
// //   },
// //   {
// //     id: 2,
// //     question: "Can I choose which mutual fund units to pledge?",
// //     answer: "Yes, you can choose which mutual fund units to pledge as collateral. However, not all mutual fund schemes are eligible for pledging. Generally, equity and hybrid mutual funds with good track records and high liquidity are accepted. The lender will evaluate the funds based on their performance, AUM, and market volatility."
// //   },
// //   {
// //     id: 3,
// //     question: "What is the loan amount range?",
// //     answer: "The loan amount typically ranges from ₹25,000 to ₹10 crores, depending on the value of your mutual fund portfolio and the lender's policies. The exact amount depends on the Loan-to-Value (LTV) ratio, which usually ranges from 50% to 80% of the current market value of your pledged mutual fund units."
// //   },
// //   {
// //     id: 4,
// //     question: "Apply for a LAMF with DhanLAP, you must:",
// //     answer: "To apply for a LAMF with DhanLAP, you must: 1) Be an Indian resident aged 21-65 years, 2) Have a minimum mutual fund portfolio value as specified, 3) Provide KYC documents (PAN, Aadhaar, bank statements), 4) Have a good credit score (typically 650+), 5) Maintain the mutual fund units in demat form, and 6) Agree to the terms and conditions of the loan agreement."
// //   },
// //   {
// //     id: 5,
// //     question: "What is the step-by-step process to get a loan?",
// //     answer: "The step-by-step process includes: 1) Online application with basic details, 2) Upload required documents (KYC, bank statements, mutual fund portfolio), 3) Portfolio evaluation and loan amount calculation, 4) Loan approval and agreement signing, 5) Mutual fund units pledging process, 6) Loan disbursement to your bank account. The entire process typically takes 24-48 hours for approval and disbursement."
// //   },
// //   {
// //     id: 6,
// //     question: "What is the Loan-to-Value (LTV) ratio?",
// //     answer: "The Loan-to-Value (LTV) ratio is the percentage of your mutual fund portfolio's current market value that you can borrow as a loan. For example, if your portfolio is worth ₹1,00,000 and the LTV is 70%, you can get a loan of up to ₹70,000. LTV ratios typically range from 50% to 80% depending on the fund type, performance, and lender policies."
// //   }
// // ];

// // const FAQ: React.FC = () => {
// //   const [openItems, setOpenItems] = useState<number[]>([]);

// //   const toggleItem = (id: number) => {
// //     setOpenItems(prev =>
// //       prev.includes(id)
// //         ? prev.filter(item => item !== id)
// //         : [...prev, id]
// //     );
// //   };

// //   const itemVariants = {
// //     hidden: { opacity: 0, y: 20 },
// //     visible: {
// //       opacity: 1,
// //       y: 0,
// //       transition: { duration: 0.3 }
// //     }
// //   };

// //   const contentVariants = {
// //     hidden: {
// //       opacity: 0,
// //       height: 0,
// //       transition: { duration: 0.2 }
// //     },
// //     visible: {
// //       opacity: 1,
// //       height: 'auto',
// //       transition: { duration: 0.3 }
// //     }
// //   };

// //   return (
// //     <section className={styles.faqSection}>
// //       <div className={styles.container}>
// //         <motion.div
// //           initial="hidden"
// //           whileInView="visible"
// //           viewport={{ once: true }}
// //           variants={itemVariants}
// //           className={styles.header}
// //         >
// //           <h2 className={styles.title}>Frequently Asked Questions</h2>
// //           <p className={styles.subtitle}>
// //             Get answers to common questions about Loan Against Mutual Funds
// //           </p>
// //         </motion.div>

// //         <div className={styles.faqList}>
// //           {faqData.map((item, index) => (
// //             <motion.div
// //               key={item.id}
// //               initial="hidden"
// //               whileInView="visible"
// //               viewport={{ once: true }}
// //               variants={itemVariants}
// //               transition={{ delay: index * 0.1 }}
// //               className={styles.faqItem}
// //             >
// //               <button
// //                 className={`${styles.questionButton} ${
// //                   openItems.includes(item.id) ? styles.active : ''
// //                 }`}
// //                 onClick={() => toggleItem(item.id)}
// //                 aria-expanded={openItems.includes(item.id)}
// //               >
// //                 <span className={styles.questionText}>{item.question}</span>
// //                 <motion.span
// //                   className={styles.icon}
// //                   animate={{ rotate: openItems.includes(item.id) ? 180 : 0 }}
// //                   transition={{ duration: 0.2 }}
// //                 >
// //                   ▼
// //                 </motion.span>
// //               </button>

// //               <AnimatePresence>
// //                 {openItems.includes(item.id) && (
// //                   <motion.div
// //                     variants={contentVariants}
// //                     initial="hidden"
// //                     animate="visible"
// //                     exit="hidden"
// //                     className={styles.answerContainer}
// //                   >
// //                     <div className={styles.answerContent}>
// //                       <p className={styles.answerText}>{item.answer}</p>
// //                     </div>
// //                   </motion.div>
// //                 )}
// //               </AnimatePresence>
// //             </motion.div>
// //           ))}
// //         </div>
// //       </div>
// //     </section>
// //   );
// // };

// // export default FAQ;

// import React, { useState } from 'react';
// import { motion, AnimatePresence } from 'framer-motion';
// import { useGetFaqQuery } from '../../store/services/faq.api';
// import styles from './FAQ.module.css';

// interface FAQItem {
//   id: number;
//   question: string;
//   answer: string;
//   status?: number;
//   created_at?: string;
//   updated_at?: string;
// }

// const FAQ: React.FC = () => {
//   const [openItems, setOpenItems] = useState<number[]>([]);
//   const { data: faqResponse, isLoading, isError, error } = useGetFaqQuery();

//   // Transform API response to match our FAQItem interface
//   const faqData: FAQItem[] = React.useMemo(() => {
//     if (!faqResponse) return [];

//     // Handle different response structures
//     let items: FAQItem[] = [];

//     if (Array.isArray(faqResponse.data)) {
//       items = faqResponse.data;
//     } else if (Array.isArray(faqResponse)) {
//       items = faqResponse;
//     } else if (faqResponse.data && typeof faqResponse.data === 'object') {
//       // Single item response
//       items = [faqResponse.data];
//     }

//     // Filter active FAQs (if status field exists, otherwise show all)
//     return items.filter((item: FAQItem) =>
//       item.status === undefined || item.status === 1
//     );
//   }, [faqResponse]);

//   const toggleItem = (id: number) => {
//     setOpenItems(prev =>
//       prev.includes(id)
//         ? prev.filter(item => item !== id)
//         : [...prev, id]
//     );
//   };

//   const itemVariants = {
//     hidden: { opacity: 0, y: 20 },
//     visible: {
//       opacity: 1,
//       y: 0,
//       transition: { duration: 0.3 }
//     }
//   };

//   const contentVariants = {
//     hidden: {
//       opacity: 0,
//       height: 0,
//       transition: { duration: 0.2 }
//     },
//     visible: {
//       opacity: 1,
//       height: 'auto',
//       transition: { duration: 0.3 }
//     }
//   };

//   // Loading state
//   if (isLoading) {
//     return (
//       <section className={styles.faqSection}>
//         <div className={styles.container}>
//           <div className={styles.header}>
//             <h2 className={styles.title}>Frequently Asked Questions</h2>
//             <p className={styles.subtitle}>
//               Get answers to common questions about our services
//             </p>
//           </div>
//           <div style={{
//             display: 'flex',
//             justifyContent: 'center',
//             alignItems: 'center',
//             minHeight: '200px',
//             fontSize: '1.1rem',
//             color: 'var(--primary-color)'
//           }}>
//             Loading FAQs...
//           </div>
//         </div>
//       </section>
//     );
//   }

//   // Error state
//   if (isError) {
//     return (
//       <section className={styles.faqSection}>
//         <div className={styles.container}>
//           <div className={styles.header}>
//             <h2 className={styles.title}>Frequently Asked Questions</h2>
//             <p className={styles.subtitle}>
//               Get answers to common questions about our services
//             </p>
//           </div>
//           <div style={{
//             display: 'flex',
//             justifyContent: 'center',
//             alignItems: 'center',
//             minHeight: '200px',
//             fontSize: '1.1rem',
//             color: '#e74c3c'
//           }}>
//             Error loading FAQs: {error?.toString() || 'Unknown error'}
//           </div>
//         </div>
//       </section>
//     );
//   }

//   // No FAQs state
//   if (faqData.length === 0) {
//     return (
//       <section className={styles.faqSection}>
//         <div className={styles.container}>
//           <div className={styles.header}>
//             <h2 className={styles.title}>Frequently Asked Questions</h2>
//             <p className={styles.subtitle}>
//               Get answers to common questions about our services
//             </p>
//           </div>
//           <div style={{
//             display: 'flex',
//             justifyContent: 'center',
//             alignItems: 'center',
//             minHeight: '200px',
//             fontSize: '1.1rem',
//             color: 'var(--primary-color)'
//           }}>
//             No FAQs available at the moment.
//           </div>
//         </div>
//       </section>
//     );
//   }

//   return (
//     <section className={styles.faqSection}>
//       <div className={styles.container}>
//         <motion.div
//           initial="hidden"
//           whileInView="visible"
//           viewport={{ once: true }}
//           variants={itemVariants}
//           className={styles.header}
//         >
//           <h2 className={styles.title}>Frequently Asked Questions</h2>
//           <p className={styles.subtitle}>
//             Get answers to common questions about our services
//           </p>
//         </motion.div>

//         <div className={styles.faqList}>
//           {faqData.map((item, index) => (
//             <motion.div
//               key={item.id}
//               initial="hidden"
//               whileInView="visible"
//               viewport={{ once: true }}
//               variants={itemVariants}
//               transition={{ delay: index * 0.1 }}
//               className={styles.faqItem}
//             >
//               <button
//                 className={`${styles.questionButton} ${
//                   openItems.includes(item.id) ? styles.active : ''
//                 }`}
//                 onClick={() => toggleItem(item.id)}
//                 aria-expanded={openItems.includes(item.id)}
//               >
//                 <span className={styles.questionText}>{item.question}</span>
//                 <motion.span
//                   className={styles.icon}
//                   animate={{ rotate: openItems.includes(item.id) ? 180 : 0 }}
//                   transition={{ duration: 0.2 }}
//                 >
//                   ▼
//                 </motion.span>
//               </button>

//               <AnimatePresence>
//                 {openItems.includes(item.id) && (
//                   <motion.div
//                     variants={contentVariants}
//                     initial="hidden"
//                     animate="visible"
//                     exit="hidden"
//                     className={styles.answerContainer}
//                   >
//                     <div className={styles.answerContent}>
//                       <p className={styles.answerText}>{item.answer}</p>
//                     </div>
//                   </motion.div>
//                 )}
//               </AnimatePresence>
//             </motion.div>
//           ))}
//         </div>
//       </div>
//     </section>
//   );
// };

// export default FAQ;

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGetFaqQuery } from "../../store/services/faq.api";
import styles from "./FAQ.module.css";

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  status?: number;
  created_at?: string;
  updated_at?: string;
}

const FAQ: React.FC = () => {
  const [openItems, setOpenItems] = useState<number[]>([]);
  const { data: faqResponse, isLoading, isError, error } = useGetFaqQuery({});

  // Transform API response to match our FAQItem interface
  const faqData: FAQItem[] = React.useMemo(() => {
    if (!faqResponse) return [];

    let items: FAQItem[] = [];

    if (Array.isArray(faqResponse.data)) {
      items = faqResponse.data;
    } else if (Array.isArray(faqResponse)) {
      items = faqResponse;
    } else if (faqResponse.data && typeof faqResponse.data === "object") {
      items = [faqResponse.data];
    }

    return items.filter(
      (item: FAQItem) => item.status === undefined || item.status === 1
    );
  }, [faqResponse]);

  const toggleItem = (id: number) => {
    setOpenItems((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.3 },
    },
  };

  const contentVariants = {
    hidden: {
      opacity: 0,
      height: 0,
      transition: { duration: 0.2 },
    },
    visible: {
      opacity: 1,
      height: "auto",
      transition: { duration: 0.3 },
    },
  };

  // Loading state
  if (isLoading) {
    return (
      <section className={styles.faqSection}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h2 className={styles.title}>Frequently Asked Questions</h2>
            <p className={styles.subtitle}>
              Get answers to common questions about our services
            </p>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "200px",
              fontSize: "1.1rem",
              color: "var(--primary-color)",
            }}
          >
            Loading FAQs...
          </div>
        </div>
      </section>
    );
  }

  // Error state
  if (isError) {
    let errorMessage = "Unknown error";

    console.error("FAQ API Error:", error);

    if (error && "data" in error && error.data) {
      if (typeof error.data === "string") {
        errorMessage = error.data;
      } else if (error.data.message) {
        errorMessage = error.data.message;
      } else {
        errorMessage = JSON.stringify(error.data);
      }
    } else if (error && "error" in error) {
      errorMessage = error.error;
    }

    return (
      <section className={styles.faqSection}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h2 className={styles.title}>Frequently Asked Questions</h2>
            <p className={styles.subtitle}>
              Get answers to common questions about our services
            </p>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "200px",
              fontSize: "1.1rem",
              color: "#e74c3c",
            }}
          >
            Error loading FAQs: {errorMessage}
          </div>
        </div>
      </section>
    );
  }

  // No FAQs state
  if (faqData.length === 0) {
    return (
      <section className={styles.faqSection}>
        <div className={styles.container}>
          <div className={styles.header}>
            <h2 className={styles.title}>Frequently Asked Questions</h2>
            <p className={styles.subtitle}>
              Get answers to common questions about our services
            </p>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: "200px",
              fontSize: "1.1rem",
              color: "var(--primary-color)",
            }}
          >
            No FAQs available at the moment.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.faqSection}>
      <div className={styles.container}>
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={itemVariants}
          className={styles.header}
        >
          <h2 className={styles.title}>Frequently Asked Questions</h2>
          <p className={styles.subtitle}>
            Get answers to common questions about our services
          </p>
        </motion.div>

        <div className={styles.faqList}>
          {faqData.map((item, index) => (
            <motion.div
              key={item.id}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={itemVariants}
              transition={{ delay: index * 0.1 }}
              className={styles.faqItem}
            >
              <button
                className={`${styles.questionButton} ${
                  openItems.includes(item.id) ? styles.active : ""
                }`}
                onClick={() => toggleItem(item.id)}
                aria-expanded={openItems.includes(item.id)}
              >
                <span className={styles.questionText}>{item.question}</span>
                <motion.span
                  className={styles.icon}
                  animate={{ rotate: openItems.includes(item.id) ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  ▼
                </motion.span>
              </button>

              <AnimatePresence>
                {openItems.includes(item.id) && (
                  <motion.div
                    variants={contentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="hidden"
                    className={styles.answerContainer}
                  >
                    <div className={styles.answerContent}>
                      <p className={styles.answerText}>{item.answer}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FAQ;
