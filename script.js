document.getElementById("submitButton").addEventListener("click", function () {
  const rawInput = document.getElementById("userInput").value;
  const CHUNK_LENGTH = 13
  const TITLE_LINE = 0;
  const DATA_TABLE_LINE = 11;
  var finding_courses = true
  var lines = rawInput.split('\n');
  var events = "";
  while (finding_courses) {
    var start_index = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('CRN') !== -1) {
        start_index = i - 2;
        break;
      } 
    }
    if (start_index == -1) {
        finding_courses = false;
        break;
    }
    lines.splice(0, start_index);
    const courseInfo = parseData(lines[DATA_TABLE_LINE], lines[TITLE_LINE]);
    const icsContent = generateICSFromCourse(courseInfo);
    lines = lines.splice(0 + CHUNK_LENGTH - 1);
    events += icsContent;
  }
  const ics_file = encloseICSForm(events);
  console.log(ics_file);
  const blob = new Blob([ics_file], { type: 'text/calendar' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'calendar.ics';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

function parseData(rawData, title) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var firstDigitIndex = rawData.indexOf(rawData.match(/\d/));
  var lastTimeIndex = rawData.lastIndexOf(":") + 6
  var classTimes = rawData.substring(firstDigitIndex, lastTimeIndex).split(' - ');
  var startTime = classTimes[0].trim();
  var endTime = classTimes[1].trim();
  var classDays = rawData.match(/[MTWRF]+/g);
  rawData = rawData.substring(lastTimeIndex + classDays[0].length + 1).trim();
  var firstMonthIndex = 99999;
  for (var month of MONTHS) {
      var monthIndex = rawData.indexOf(month);
      if (monthIndex !== -1 && monthIndex < firstMonthIndex) {
          firstMonthIndex = monthIndex;
      }
  }
  var location = rawData.substring(0, firstMonthIndex).trim();
  var classDates = rawData.substring(firstMonthIndex, rawData.lastIndexOf('2025') + 4).split(' - ');
  var startDate = classDates[0].trim();
  var endDate = classDates[1].trim();
  var courseInfo = {
      title: title,
      startTime: startTime,
      endTime: endTime,
      days: classDays[0].split(''),
      location: location,
      startDate: startDate,
      endDate: endDate
  };
  return courseInfo;
}

function formatICSDate(date, time, UTC) {
  const monthMap = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04',
    May: '05', Jun: '06', Jul: '07', Aug: '08',
    Sep: '09', Oct: '10', Nov: '11', Dec: '12'
  };

  const [monthStr, dayWithComma, year] = date.split(' ');
  const day = dayWithComma.replace(',', '').padStart(2, '0');
  const month = monthMap[monthStr];
  const formattedDate = `${year}${month}${day}`;

  const [hour, minutePart] = time.split(':');
  const [minute, meridian] = minutePart.split(' ');
  let h = parseInt(hour, 10);
  if (UTC) {
    h = (h + 5) % 24
  }
  if (meridian.toLowerCase() === 'pm' && h !== 12) h += 12;
  if (meridian.toLowerCase() === 'am' && h === 12) h = 0;
  const formattedTime = `${String(h).padStart(2, '0')}${minute}00`;

  return `${formattedDate}T${formattedTime}`;
}

function generateUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  }) + '@northeastern.edu';
}

function encloseICSForm(content) {
  var warapped_content = `
  BEGIN:VCALENDAR
  VERSION:2.0
  PRODID:-//Class Generator//EN
  CALSCALE:GREGORIAN
  ${content}
  
  END:VCALENDAR`;
  var lines = warapped_content.split('\n');
  var cleaned_content = '';
  for (var line of lines) {
    cleaned_content += line.trim() + '\n';
  }
  return cleaned_content
}

function generateICSFromCourse(courseInfo) {
    const uid = generateUID()
    const title = courseInfo.title || '';
    const location = courseInfo.location || '';
    const startDate = courseInfo.startDate
    const endDate = formatICSDate(courseInfo.endDate, courseInfo.endTime, true);
    const startTime = formatICSDate(startDate, courseInfo.startTime, false);
    const endTime = formatICSDate(startDate, courseInfo.endTime, false);
    const byDay = courseInfo.days.map(d => ({ M: 'MO', T: 'TU', W: 'WE', R: 'TH', F: 'FR', S: 'SA', U: 'SU' }[d])).join(',');

    const icsContent = `
    BEGIN:VEVENT
    UID:${uid}
    DTSTAMP:20240101T000000Z
    SUMMARY:${title}
    DESCRIPTION:Scheduled Class
    LOCATION:${location}
    DTSTART;TZID=America/New_York:${startTime}
    DTEND;TZID=America/New_York:${endTime}
    RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${endDate}Z
    STATUS:CONFIRMED
    SEQUENCE:0
    TRANSP:OPAQUE
    BEGIN:VALARM
    TRIGGER:-PT15M
    ACTION:DISPLAY
    END:VALARM
    END:VEVENT`;
    return icsContent;
}

