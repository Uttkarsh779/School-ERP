-- Starter website content. Each block inserts only when its table is still empty.
-- Apply with: npx prisma db execute --file prisma/cms_v2_seed.sql
INSERT INTO "WebsiteTestimonial" ("name", "relation", "quote", "order")
SELECT * FROM (VALUES
  ('Mrs. Anita Verma', 'Parent of a Class V student', 'The teachers know every child by name. My daughter looks forward to school every single day, and we can see her confidence growing.', 1),
  ('Mr. Rakesh Yadav', 'Parent of Class VIII and Class III students', 'Regular updates on attendance, homework and results through the school app keep us fully involved. The discipline and care here are excellent.', 2),
  ('Priya Singh', 'Alumna, Batch of 2022', 'The school gave me strong basics in science and the courage to speak on stage. The guidance during board exams was outstanding.', 3)
) AS v("name", "relation", "quote", "order")
WHERE NOT EXISTS (SELECT 1 FROM "WebsiteTestimonial");

INSERT INTO "WebsiteFaq" ("question", "answer", "order")
SELECT * FROM (VALUES
  ('When do admissions open?', 'Registrations for the new academic session usually open in December–January. Admissions for other classes are subject to seat availability throughout the year.', 1),
  ('What is the age criteria for Nursery and Class I?', 'A child should be at least 3 years old for Nursery and 6 years old for Class I as on 31st March of the admission year.', 2),
  ('Which documents are required?', 'Birth certificate, Aadhaar card of the child and parents, recent passport-size photographs, previous school report card and the Transfer Certificate (for Class II onwards).', 3),
  ('Is school transport available?', 'Yes. GPS-tracked buses cover nearby villages and towns. Transport fees depend on the route; please ask the office for the current route list.', 4),
  ('Is there an entrance test?', 'There is no test for Nursery to Class I. For higher classes a simple interaction / assessment in English, Hindi and Mathematics helps us place the child well.', 5),
  ('How can parents track their child''s progress?', 'Parents and students get a login to the school portal to view attendance, homework, report cards, notices and fee details online.', 6)
) AS v("question", "answer", "order")
WHERE NOT EXISTS (SELECT 1 FROM "WebsiteFaq");
