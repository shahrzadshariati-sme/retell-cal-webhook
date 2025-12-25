export default async function handler(req, res) {
  const timestamp = new Date().toISOString();
  
  console.log('========================================');
  console.log('CANCEL APPOINTMENT - FULL DEBUG');
  console.log(`Timestamp: ${timestamp}`);
  console.log('========================================');
  
  // ==========================================
  // STEP 1: LOG EVERYTHING ABOUT THE REQUEST
  // ==========================================
  console.log('\n--- STEP 1: REQUEST DETAILS ---');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Query params:', JSON.stringify(req.query, null, 2));
  console.log('Body (raw):', JSON.stringify(req.body, null, 2));
  console.log('Body type:', typeof req.body);
  console.log('Body keys:', Object.keys(req.body || {}));

  if (req.method !== 'POST') {
    console.log('ERROR: Wrong method - expected POST, got', req.method);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ==========================================
  // STEP 2: EXTRACT EMAIL FROM ALL POSSIBLE LOCATIONS
  // ==========================================
  console.log('\n--- STEP 2: EMAIL EXTRACTION ---');
  
  const emailCandidates = {
    direct: req.body?.customer_email,
    args: req.body?.args?.customer_email,
    parameters: req.body?.parameters?.customer_email,
    argument: req.body?.argument?.customer_email,
    data: req.body?.data?.customer_email,
    input: req.body?.input?.customer_email,
  };
  
  console.log('All email candidates:', JSON.stringify(emailCandidates, null, 2));
  
  const customer_email = emailCandidates.direct 
    || emailCandidates.args 
    || emailCandidates.parameters 
    || emailCandidates.argument
    || emailCandidates.data
    || emailCandidates.input;

  console.log('Selected email:', customer_email);
  console.log('Email type:', typeof customer_email);
  console.log('Email length:', customer_email?.length);

  if (!customer_email) {
    console.log('ERROR: No email found in request');
    console.log('Full request body structure:', JSON.stringify(req.body, null, 2));
    return res.status(400).json({ 
      success: false, 
      message: 'Email is required',
      debug: {
        receivedBody: req.body,
        emailCandidates: emailCandidates,
        extractedEmail: customer_email
      }
    });
  }

  // ==========================================
  // STEP 3: CHECK ENVIRONMENT VARIABLES
  // ==========================================
  console.log('\n--- STEP 3: ENVIRONMENT CHECK ---');
  console.log('CAL_API_KEY exists:', !!process.env.CAL_API_KEY);
  console.log('CAL_API_KEY length:', process.env.CAL_API_KEY?.length || 0);
  console.log('CAL_API_KEY first 10 chars:', process.env.CAL_API_KEY?.substring(0, 10) || 'NOT SET');

  if (!process.env.CAL_API_KEY) {
    console.log('ERROR: CAL_API_KEY not set in environment');
    return res.status(500).json({
      success: false,
      message: 'Server configuration error: API key not set'
    });
  }

  try {
    // ==========================================
    // STEP 4: FETCH BOOKINGS FROM CAL.COM
    // ==========================================
    console.log('\n--- STEP 4: FETCHING BOOKINGS FROM CAL.COM ---');
    
    const searchUrl = `https://api.cal.com/v2/bookings?status=upcoming`;
    console.log('Request URL:', searchUrl);
    console.log('Request headers:', {
      'Authorization': 'Bearer [REDACTED]',
      'cal-api-version': '2024-08-13'
    });

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.CAL_API_KEY}`,
        'cal-api-version': '2024-08-13'
      }
    });

    console.log('Response status:', searchResponse.status);
    console.log('Response status text:', searchResponse.statusText);
    console.log('Response headers:', JSON.stringify(Object.fromEntries(searchResponse.headers.entries()), null, 2));

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.log('ERROR: Cal.com API error');
      console.log('Error response:', errorText);
      return res.status(searchResponse.status).json({
        success: false,
        message: `Cal.com API error: ${errorText}`
      });
    }

    const searchData = await searchResponse.json();
    console.log('Response data keys:', Object.keys(searchData));
    console.log('Number of bookings:', searchData.data?.length || 0);
    
    // ==========================================
    // STEP 5: LOG COMPLETE BOOKING STRUCTURE
    // ==========================================
    console.log('\n--- STEP 5: COMPLETE BOOKING DATA ---');
    console.log('FULL API RESPONSE:', JSON.stringify(searchData, null, 2));

    if (!searchData.data || searchData.data.length === 0) {
      console.log('ERROR: No upcoming appointments found in Cal.com');
      return res.status(404).json({
        success: false,
        message: 'No upcoming appointments found in your Cal.com account. Either all appointments are past/cancelled, or the API key may be for a different account.'
      });
    }

    // ==========================================
    // STEP 6: SEARCH FOR MATCHING BOOKING
    // ==========================================
    console.log('\n--- STEP 6: SEARCHING FOR MATCHING BOOKING ---');
    console.log('Looking for email:', customer_email);
    console.log('Total bookings to check:', searchData.data.length);

    let matchingBooking = null;
    let bookingIndex = 0;

    for (const booking of searchData.data) {
      bookingIndex++;
      console.log(`\n>>> Checking booking ${bookingIndex}/${searchData.data.length} <<<`);
      console.log('Booking UID:', booking.uid);
      console.log('Booking structure:', JSON.stringify(booking, null, 2));
      
      // Extract all possible email locations
      const emailLocations = {
        'attendees[0].email': booking.attendees?.[0]?.email,
        'responses.email': booking.responses?.email,
        'guests[0].email': booking.guests?.[0]?.email,
        'email': booking.email,
        'attendeeEmail': booking.attendeeEmail,
        'user.email': booking.user?.email,
        'organizer.email': booking.organizer?.email,
      };
      
      console.log('Email locations found:', JSON.stringify(emailLocations, null, 2));
      
      // Check each location
      for (const [location, emailValue] of Object.entries(emailLocations)) {
        if (emailValue) {
          console.log(`  Comparing ${location}: "${emailValue}" vs "${customer_email}"`);
          console.log(`  Match (case-insensitive): ${emailValue.toLowerCase() === customer_email.toLowerCase()}`);
          
          if (emailValue.toLowerCase() === customer_email.toLowerCase()) {
            console.log(`  ✓ MATCH FOUND at ${location}!`);
            matchingBooking = booking;
            break;
          }
        }
      }
      
      if (matchingBooking) break;
    }

    if (!matchingBooking) {
      console.log('\nERROR: No matching booking found');
      console.log('Searched for:', customer_email);
      console.log('All bookings checked:', searchData.data.length);
      
      // Collect all emails found in bookings for diagnostic purposes
      const foundEmails = [];
      searchData.data.forEach(b => {
        const emails = [
          b.attendees?.[0]?.email,
          b.responses?.email,
          b.email,
          b.user?.email
        ].filter(Boolean);
        foundEmails.push(...emails);
      });
      
      console.log('All available emails in bookings:', foundEmails);
      
      return res.status(404).json({
        success: false,
        message: `No appointment found for "${customer_email}". Cal.com has ${searchData.data.length} upcoming booking(s) with these emails: [${foundEmails.join(', ')}]. Check for typos or case sensitivity.`,
        debug: {
          searchedEmail: customer_email,
          totalBookings: searchData.data.length,
          foundEmails: foundEmails
        }
      });
    }

    // ==========================================
    // STEP 7: CANCEL THE BOOKING
    // ==========================================
    console.log('\n--- STEP 7: CANCELLING BOOKING ---');
    console.log('Booking UID to cancel:', matchingBooking.uid);
    
    const cancelUrl = `https://api.cal.com/v2/bookings/${matchingBooking.uid}`;
    console.log('Cancel URL:', cancelUrl);
    
    const cancelBody = {
      cancellationReason: 'Cancelled via phone call'
    };
    console.log('Cancel request body:', JSON.stringify(cancelBody, null, 2));

    const cancelResponse = await fetch(cancelUrl, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${process.env.CAL_API_KEY}`,
        'cal-api-version': '2024-08-13',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(cancelBody)
    });

    console.log('Cancel response status:', cancelResponse.status);
    console.log('Cancel response status text:', cancelResponse.statusText);

    if (!cancelResponse.ok) {
      const cancelError = await cancelResponse.text();
      console.log('ERROR: Cancel failed');
      console.log('Cancel error response:', cancelError);
      return res.status(cancelResponse.status).json({
        success: false,
        message: `Failed to cancel: ${cancelError}`
      });
    }

    const cancelData = await cancelResponse.json();
    console.log('Cancel success response:', JSON.stringify(cancelData, null, 2));

    // ==========================================
    // SUCCESS!
    // ==========================================
    console.log('\n--- SUCCESS ---');
    console.log('Appointment cancelled successfully');
    console.log('Booking UID:', matchingBooking.uid);
    console.log('Customer email:', customer_email);
    console.log('========================================\n');

    return res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully',
      booking_uid: matchingBooking.uid
    });

  } catch (error) {
    // ==========================================
    // CATASTROPHIC ERROR
    // ==========================================
    console.log('\n--- CATASTROPHIC ERROR ---');
    console.log('Error name:', error.name);
    console.log('Error message:', error.message);
    console.log('Error stack:', error.stack);
    console.log('========================================\n');
    
    return res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack
      }
    });
  }
}
