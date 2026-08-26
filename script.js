document.getElementById("submitButton").addEventListener("click", function () {
  // Evrything goes in a try catch block because I am lazy and will not do any proper error handeling
  try {
    const rawData = document.getElementById("userInput").value;
    const ics_events = genorateEvents(rawData);
    if (ics_events === "") {
      alert("No valid course data found. Please check your input.");
      return;
  }
  const ics_file = wrapEvents(ics_events);
  genorateDownloadLink(ics_file);
  } catch (error) {
    alert("An error occured! Check your input and try again.");
    console.error(error)
  }
});

function genorateEvents(rawData) {
  const lines = rawData.split('\n');
  const events = [];
  let currentBlock = [];

  for (const line of lines) {
    if (line.trim() === '' && currentBlock.length === 0) {
      continue;
    }

    currentBlock.push(line);

    if (line.includes('CRN:')) {
      const event = parseScheduleBlock(currentBlock.join('\n'));
      if (event) {
        events.push(formatEvent(event));
      }
      currentBlock = [];
    }
  }

  return events.join('');
}

function parseScheduleBlock(blockText) {
  const titleLine = blockText.split('\n').find(line => line.includes('Class Begin:')) || '';
  const markdownTitleMatch = titleLine.match(/^\[([^\]]+)\]/);
  const title = markdownTitleMatch ? markdownTitleMatch[1].trim() : titleLine.split('|')[0].trim();

  const waitlistMatch = blockText.match(/Waitlist Position:\s*(\d+)/i);
  if (waitlistMatch && parseInt(waitlistMatch[1], 10) > 0) {
    return null;
  }

  const timeLine = blockText.split('\n').find(line => line.includes('Type: Class') && line.includes(' - ')) || '';
  if (timeLine.includes('TBA')) {
    return null;
  }

  const scheduleLine = blockText.split('\n').find(line => line.includes('--') && /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/.test(line)) || '';
  const scheduleMatch = scheduleLine.match(/([0-9]{2}\/\d{2}\/\d{4})\s*--\s*([0-9]{2}\/\d{2}\/\d{4})\s+(.+)$/);
  if (!scheduleMatch) {
    return null;
  }

  const timeMatch = timeLine.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (!timeMatch) {
    return null;
  }

  const locationMatch = timeLine.match(/Location:\s*(.+)$/i);
  const location = locationMatch ? locationMatch[1].trim() : '';

  const instructorLine = blockText.split('\n').find(line => line.startsWith('Instructor:')) || '';
  const instructor = instructorLine
    .replace(/^Instructor:\s*/i, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s*\([^)]+\)\s*$/g, '')
    .trim();

  const dayMap = {
    monday: 'M',
    tuesday: 'T',
    wednesday: 'W',
    thursday: 'R',
    friday: 'F',
    saturday: 'S',
    sunday: 'U'
  };
  const days = scheduleMatch[3]
    .split(',')
    .map(day => dayMap[day.trim().toLowerCase()])
    .filter(Boolean);

  if (days.length === 0) {
    const legacyDayMatch = blockText.match(/[MTWRFSU]+/g);
    if (legacyDayMatch) {
      days.push(...legacyDayMatch[0].split(''));
    }
  }

  return {
    title: title,
    startTime: timeMatch[1].trim(),
    endTime: timeMatch[2].trim(),
    days: days,
    location: location,
    startDate: scheduleMatch[1].trim(),
    endDate: scheduleMatch[2].trim(),
    instructor: instructor
  };
}

function firstOccurrenceOnOrAfter(dateStr, days) {
  const dayIndices = { U: 0, M: 1, T: 2, W: 3, R: 4, F: 5, S: 6 };
  const [month, day, year] = dateStr.split('/').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  for (let i = 0; i < 7; i++) {
    const letterForDow = Object.keys(dayIndices).find(letter => dayIndices[letter] === date.getUTCDay());
    if (days.includes(letterForDow)) break;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  const adjMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const adjDay = String(date.getUTCDate()).padStart(2, '0');
  return `${adjMonth}/${adjDay}/${date.getUTCFullYear()}`;
}

function formatEvent(event) {
  const uid = generateUID()
  const title = event.title;
  const location = event.location;
  const startDate = firstOccurrenceOnOrAfter(event.startDate, event.days);
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

function getEasternOffsetMinutes(utcGuess) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const parts = dtf.formatToParts(utcGuess).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const asIfUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return (asIfUTC - utcGuess.getTime()) / 60000;
}

function formatDate(date, time, UTC) {
  let year;
  let month;
  let day;

  if (date.includes('/')) {
    const dateParts = date.split('/');
    month = dateParts[0].padStart(2, '0');
    day = dateParts[1].padStart(2, '0');
    year = dateParts[2];
  } else {
    const monthMap = {
      Jan: '01', Feb: '02', Mar: '03', Apr: '04',
      May: '05', Jun: '06', Jul: '07', Aug: '08',
      Sep: '09', Oct: '10', Nov: '11', Dec: '12'
    };

    const [monthStr, dayWithComma, parsedYear] = date.split(' ');
    day = dayWithComma.replace(',', '').padStart(2, '0');
    month = monthMap[monthStr];
    year = parsedYear;
  }

  const [hour, minutePart] = time.split(':');
  const [minute, meridian] = minutePart.split(' ');
  let h = parseInt(hour, 10);
  if (meridian.toLowerCase() === 'pm' && h !== 12) {
    h += 12;
  }
  if (meridian.toLowerCase() === 'am' && h === 12) {
    h = 0;
  }

  if (!UTC) {
    const formattedDate = `${year}${month}${day}`;
    const formattedTime = `${String(h).padStart(2, '0')}${minute}00`;
    return `${formattedDate}T${formattedTime}`;
  }

  const naiveUTC = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), h, Number(minute)));
  const offsetMinutes = getEasternOffsetMinutes(naiveUTC);
  const actualUTC = new Date(naiveUTC.getTime() - offsetMinutes * 60000);

  const y = actualUTC.getUTCFullYear();
  const mo = String(actualUTC.getUTCMonth() + 1).padStart(2, '0');
  const d = String(actualUTC.getUTCDate()).padStart(2, '0');
  const hh = String(actualUTC.getUTCHours()).padStart(2, '0');
  const mm = String(actualUTC.getUTCMinutes()).padStart(2, '0');
  return `${y}${mo}${d}T${hh}${mm}00`;
}

function wrapEvents(events) {
  // Wraper includes my bierthday because why not
  var wrapped_events = `
  BEGIN:VCALENDAR
  VERSION:2.0
  PRODID:-//CalendarGenerator//EN
  CALSCALE:GREGORIAN
  ${events}
  END:VCALENDAR`;
  // Cleans up the resulting ics file to ensure it can be accurtly parsed
  var lines = wrapped_events.split('\n');
  var cleaned_content = '';
  for (var line of lines) {
    line = line.trim();
    if (line !== '') {
      cleaned_content += line + '\r\n';
    }
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