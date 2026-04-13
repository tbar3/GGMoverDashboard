// Parses SmartMoving Google Calendar events into structured job data

export interface ParsedJob {
  job_number: string;
  service_type: string;
  customer_name: string;
  date: string;
  start_time: string;
  end_time: string;
  // From description
  branch: string | null;
  job_details: string | null;
  pricing_type: string | null;
  revenue: number | null;
  customer_phone: string | null;
  customer_email: string | null;
  lead_source: string | null;
  estimated_hours: number | null;
  volume_cuft: number | null;
  weight_lbs: number | null;
  arrival_window: string | null;
  origin_address: string | null;
  property_type: string | null;
  // Notes
  dispatch_notes: string | null;
  internal_notes: string | null;
  crew_notes: string | null;
  customer_notes: string | null;
  // Crew & truck
  quoted_trucks: number | null;
  quoted_crew: number | null;
  truck_name: string | null;
  crew_members: { name: string; phone: string }[];
  // Calendar event ID for sync
  calendar_event_id: string;
}

export function parseCalendarEvent(event: {
  id?: string | null;
  summary?: string | null;
  description?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
}): ParsedJob | null {
  if (!event.summary || !event.id) return null;

  // Parse title: "1369-1 – Moving – Charles Beck" or "1369-1 - Moving - Charles Beck"
  const titleParts = event.summary.split(/\s*[–-]\s*/);
  if (titleParts.length < 3) return null;

  const job_number = titleParts[0].trim();
  const service_type = titleParts[1].trim();
  const customer_name = titleParts.slice(2).join(' - ').trim();

  // Parse dates
  const startStr = event.start?.dateTime || event.start?.date || '';
  const endStr = event.end?.dateTime || event.end?.date || '';
  const startDate = new Date(startStr);
  const date = startDate.toISOString().split('T')[0];
  const start_time = startDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  const endDate = new Date(endStr);
  const end_time = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const desc = event.description || '';

  const result: ParsedJob = {
    job_number,
    service_type,
    customer_name,
    date,
    start_time,
    end_time,
    branch: extractField(desc, 'Branch:'),
    job_details: null,
    pricing_type: null,
    revenue: null,
    customer_phone: null,
    customer_email: null,
    lead_source: extractField(desc, 'From:'),
    estimated_hours: extractNumber(desc, 'Estimated time:'),
    volume_cuft: extractNumber(desc, 'Volume:'),
    weight_lbs: extractNumber(desc, 'Weight:'),
    arrival_window: extractField(desc, 'Arrival:'),
    origin_address: extractField(desc, 'Origin:'),
    property_type: null,
    dispatch_notes: extractNotes(desc, 'Dispatch notes:'),
    internal_notes: extractNotes(desc, 'Internal notes:'),
    crew_notes: extractNotes(desc, 'Crew notes:'),
    customer_notes: extractNotes(desc, 'Customer notes:'),
    quoted_trucks: null,
    quoted_crew: null,
    truck_name: extractField(desc, 'Trucks:'),
    crew_members: [],
    calendar_event_id: event.id,
  };

  // Parse pricing line: "Non-Binding (hourly) / $500.00"
  const pricingMatch = desc.match(/(Non-Binding|Binding|Flat Rate)[^/]*\/\s*\$?([\d,.]+)/i);
  if (pricingMatch) {
    result.pricing_type = pricingMatch[1];
    result.revenue = parseFloat(pricingMatch[2].replace(',', ''));
  }

  // Parse phone — line with customer name followed by a phone number
  const phoneMatch = desc.match(/(?:^|\n)\s*(?:[A-Z][a-z]+ )*[A-Z][a-z]+\s*\n\s*(\d{3}-\d{3}-\d{4})/m)
    || desc.match(/(\d{3}-\d{3}-\d{4})/);
  if (phoneMatch) {
    result.customer_phone = phoneMatch[1];
  }

  // Parse email
  const emailMatch = desc.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
  if (emailMatch) {
    result.customer_email = emailMatch[1];
  }

  // Parse property type — line after Origin address
  const originIdx = desc.indexOf('Origin:');
  if (originIdx !== -1) {
    const afterOrigin = desc.substring(originIdx);
    const lines = afterOrigin.split('\n');
    if (lines.length >= 2) {
      const propertyLine = lines[1]?.trim();
      if (propertyLine && !propertyLine.includes(':') && propertyLine.length < 100) {
        result.property_type = propertyLine;
      }
    }
  }

  // Parse "Quoted: 1 trucks, 4 crew"
  const quotedMatch = desc.match(/Quoted:\s*(\d+)\s*trucks?,\s*(\d+)\s*crew/i);
  if (quotedMatch) {
    result.quoted_trucks = parseInt(quotedMatch[1]);
    result.quoted_crew = parseInt(quotedMatch[2]);
  }

  // Parse crew list: "Crew: Name Phone\nName Phone\n..."
  const crewMatch = desc.match(/Crew:\s*(.+(?:\n(?!\s*$|\s*\w+:).+)*)/i);
  if (crewMatch) {
    const crewBlock = crewMatch[1];
    const crewLines = crewBlock.split('\n');
    for (const line of crewLines) {
      const memberMatch = line.trim().match(/^(.+?)\s+(\d{3}-\d{3}-\d{4})/);
      if (memberMatch) {
        result.crew_members.push({
          name: memberMatch[1].replace(/^Crew:\s*/i, '').trim(),
          phone: memberMatch[2],
        });
      }
    }
  }

  // Parse job details line: "1369-1 / Moving / 2 Bedroom House"
  const detailsMatch = desc.match(new RegExp(job_number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*/\\s*(.+)'));
  if (detailsMatch) {
    result.job_details = detailsMatch[1].trim();
  }

  return result;
}

function extractField(text: string, label: string): string | null {
  const regex = new RegExp(label + '\\s*(.+)', 'i');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function extractNumber(text: string, label: string): number | null {
  const regex = new RegExp(label + '\\s*([\\d,.]+)', 'i');
  const match = text.match(regex);
  return match ? parseFloat(match[1].replace(',', '')) : null;
}

function extractNotes(text: string, label: string): string | null {
  const regex = new RegExp(label + '\\s*(.*)', 'i');
  const match = text.match(regex);
  const value = match ? match[1].trim() : null;
  return value || null;
}
