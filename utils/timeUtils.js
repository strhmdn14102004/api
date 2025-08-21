const moment = require('moment-timezone');

class TimeUtils {
  // Simpan selalu dalam UTC di database
  static getUTCTime() {
    return moment.utc().toDate();
  }

  // Format waktu berdasarkan timezone user
  static formatForUser(date, timezone = 'Asia/Jakarta', format = 'DD MMMM YYYY HH:mm:ss') {
    if (!date) return '-';
    try {
      const validTimezone = this.isValidTimezone(timezone) ? timezone : 'Asia/Jakarta';
      return moment.utc(date).tz(validTimezone).format(format);
    } catch (error) {
      return moment.utc(date).format(format);
    }
  }

  // Dapatkan waktu sekarang dalam timezone user
  static getCurrentForUser(timezone = 'Asia/Jakarta') {
    const validTimezone = this.isValidTimezone(timezone) ? timezone : 'Asia/Jakarta';
    return moment().tz(validTimezone).toDate();
  }

  // Parse waktu dari user input ke UTC
  static parseToUTC(dateString, timezone = 'Asia/Jakarta') {
    const validTimezone = this.isValidTimezone(timezone) ? timezone : 'Asia/Jakarta';
    return moment.tz(dateString, validTimezone).utc().toDate();
  }

  // Deteksi timezone user dari request headers
  static detectTimezone(req) {
    if (!req || !req.headers) return 'Asia/Jakarta';
    
    // Coba dapatkan dari header
    const timezoneHeader = req.headers['x-timezone'] || req.headers['timezone'];
    
    if (timezoneHeader && this.isValidTimezone(timezoneHeader)) {
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
    if (!timezone || typeof timezone !== 'string') return false;
    try {
      return moment.tz.zone(timezone) !== null;
    } catch (error) {
      return false;
    }
  }
}

module.exports = TimeUtils;