import fs from "fs/promises";

export const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

export const dirExists = async (dirPath) => {
  try {
    const stats = await fs.stat(dirPath);
    return stats.isDirectory();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const getUTCTime = (date) => {
  return date.getTime() + date.getTimezoneOffset() * 60 * 1000;
};

export const translateToWeekNumber = (dateToTranslate, startDay) => {
  const daysDiff = Math.floor(
    (getUTCTime(dateToTranslate) - getUTCTime(startDay)) / (1000 * 60 * 60 * 24)
  );
  return 1 + Math.floor(daysDiff / 7);
};

export const encodeRFC2047 = (str) => {
  return "=?UTF-8?B?" + Buffer.from(str, "utf-8").toString("base64") + "?=";
};
