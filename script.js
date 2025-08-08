document.getElementById("submitButton").addEventListener("click", function () {
  const rawData = document.getElementById("userInput").value;
  const ics_events = genorateEvents(rawData);
  const ics_file = wrapEvents(ics_events);
  console.log(ics_file);
  // genorateDownloadLink(ics_file);
});

function genorateEvents(rawData) {
  const CHUNK_LENGTH = 13
  const TITLE_LINE = 0;
  const INSTRUCTOR_LINE = 4;
  const START_LINE_OFFSET = 2;
  const DATA_TABLE_LINE = 11;
  var lines = rawData.split('\n');
  var parsingData = true
  var events = "";
  while (parsingData) {
    var start_index = -1;
    for (var i = 0; i < lines.length; i++) {
      // A course data chunk has been located
      if (lines[i].indexOf('CRN') !== -1) {
        start_index = i - START_LINE_OFFSET;
        break;
      } 
    }
    if (start_index == -1) {
      // No more course data chunks found
        parsingData = false;
        break;
    }
    // Cut off any prior data
    lines.splice(0, start_index);
    if (lines[DATA_TABLE_LINE].indexOf("TBA") == -1) {
      const event = genorateEvent(lines[DATA_TABLE_LINE], lines[TITLE_LINE], lines[INSTRUCTOR_LINE]);
      const icsContent = formatEvent(event);
      events += icsContent;
    }
    // Remove the processed data chunk
    lines = lines.splice(0 + CHUNK_LENGTH - 1);
  }
  return events;
}

function genorateEvent(rawData, title_line, instructor_line) {
  const LAST_TIME_DELTA = 6
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 
    'May', 'Jun', 'Jul', 'Aug', 
    'Sep', 'Oct', 'Nov', 'Dec'
  ];
  const firstDigitIndex = rawData.indexOf(rawData.match(/\d/));
  const lastTimeIndex = rawData.lastIndexOf(":") + LAST_TIME_DELTA;
  const classTimes = rawData.substring(firstDigitIndex, lastTimeIndex).split(' - ');
  const classDays = rawData.match(/[MTWRF]+/g);
  var instructor = instructor_line
  if (instructor.indexOf('E-mail') !== -1) {
    instructor = instructor.substring(0, instructor.indexOf('E-mail')).trim();
  }
  if (instructor.indexOf(':') !== -1) {
    instructor = instructor.substring(instructor.indexOf(':') + 1).trim();
  }
  rawData = rawData.substring(lastTimeIndex + classDays[0].length + 1).trim();
  var firstMonthIndex = 99999;
  for (var month of MONTHS) {
    var monthIndex = rawData.indexOf(month);
    if (monthIndex !== -1 && monthIndex < firstMonthIndex) {
        firstMonthIndex = monthIndex;
    }
  }
  const location = rawData.substring(0, firstMonthIndex).trim();
  const classDates = rawData.substring(firstMonthIndex, rawData.lastIndexOf('2025') + 4).split(' - ');
  const startDate = classDates[0].trim();
  const endDate = classDates[1].trim();
  const startTime = classTimes[0].trim();
  const endTime = classTimes[1].trim();
  const event = {
    title: title_line,
    startTime: startTime,
    endTime: endTime,
    days: classDays[0].split(''),
    location: location,
    startDate: startDate,
    endDate: endDate,
    instructor: instructor
  };
  return event;
}

function formatEvent(event) {
  const uid = generateUID()
  const title = event.title;
  const location = event.location;
  const startDate = event.startDate
  // endDate must be in UTC
  const endDate = formatDate(event.endDate, event.endTime, true);
  const startTime = formatDate(startDate, event.startTime, false);
  const endTime = formatDate(startDate, event.endTime, false);
  const byDay = event.days.map(d => ({ M: 'MO', T: 'TU', W: 'WE', R: 'TH', F: 'FR', S: 'SA', U: 'SU' }[d])).join(',');
  const instructor = event.instructor;

  const icsContent = `
  BEGIN:VEVENT
  UID:${uid}
  DTSTAMP:20240101T000000Z
  SUMMARY:${title}
  DESCRIPTION:Scheduled Class with ${instructor}
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

function formatDate(date, time, UTC) {
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

function wrapEvents(events) {
  var wrapped_events = `
  BEGIN:VCALENDAR
  VERSION:2.0
  PRODID:-//CalendarGenerator//EN
  CALSCALE:GREGORIAN
  ${events}

  END:VCALENDAR`;
  var lines = wrapped_events.split('\n');
  var cleaned_content = '';
  for (var line of lines) {
    cleaned_content += line.trim() + '\n';
  }
  return cleaned_content
}

function generateUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  }) + '@northeastern.edu';
}

function genorateDownloadLink(ics_file) {
  const blob = new Blob([ics_file], { type: 'text/calendar' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'calendar.ics';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}