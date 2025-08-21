const moment = require('moment-timezone');

class TimeUtils {
  // Simpan selalu dalam UTC di database
  static getUTCTime() {
    return moment.utc().toDate();
  }

  // Format waktu berdasarkan timezone user
  static formatForUser(date, timezone = 'Asia/Jakarta', format = 'DD MMMM YYYY HH:mm:ss') {
    if (!date) return '-';
    return moment.utc(date).tz(timezone).format(format);
  }

  // Dapatkan waktu sekarang dalam timezone user
  static getCurrentForUser(timezone = 'Asia/Jakarta') {
    return moment().tz(timezone).toDate();
  }

  // Parse waktu dari user input ke UTC
  static parseToUTC(dateString, timezone = 'Asia/Jakarta') {
    return moment.tz(dateString, timezone).utc().toDate();
  }

  // Deteksi timezone user dari request headers
  static detectTimezone(req) {
    // Coba dapatkan dari header
    const timezoneHeader = req.headers['x-timezone'] || req.headers['timezone'];
    
    if (timezoneHeader && moment.tz.zone(timezoneHeader)) {
      return timezoneHeader;
    }

    // Fallback ke Jakarta
    return 'Asia/Jakarta';
  }

  // Tambahkan menit ke waktu UTC
  static addMinutesUTC(date, minutes) {
    return moment.utc(date).add(minutes, 'minutes').toDate();
  }

  // Validasi timezone
  static isValidTimezone(timezone) {
    return moment.tz.zone(timezone) !== null;
  }
}

module.exports = TimeUtils;