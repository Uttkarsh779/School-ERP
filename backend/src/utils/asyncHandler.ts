import type { NextFunction, Request, Response } from "express";

// Express 4 doesn't catch rejected promises from async handlers — an unhandled
// rejection there crashes the whole process. Wrap every async controller with
// this so failures become a normal next(err) instead of taking the server down.
export const asyncHandler =
  <Req extends Request = Request>(
    fn: (req: Req, res: Response, next: NextFunction) => Promise<unknown>
  ) =>
  (req: Req, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
