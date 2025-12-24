export default async function handler(req, res) {
  // Log everything for debugging
  console.log('Request method:', req.method);
  console.log('Request body:', JSON.stringify(req.body));
  console.log('Request headers:', JSON.stringify(req.headers));

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { customer_email } = req.body;

  console.log('Extracted customer_email:', customer_email);

  if (!customer_email) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email is required',
      debug: {
        receivedBody: req.body,
        extractedEmail: customer_email
      }
    });
  }

  try {
    const searchUrl = `https://api.cal.com/v2/bookings?status=upcoming`;
    console.log('Fetching from Cal.com:', searchUrl);

    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${process.env.CAL_API_KEY}`,
        'cal-api-version': '2024-08-13'
      }
    });

    console.log('Cal.com response status:', searchResponse.status);

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.log('Cal.com error:', errorText);
      return res.status(searchResponse.status).json({
        success: false,
        message: `Cal.com API error: ${errorText}`
      });
    }

    const searchData = await searchResponse.json();
    console.log('Found bookings:', searchData.data?.length || 0);

    if (!searchData.data || searchData.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No upcoming appointments found'
      });
    }

    // Log all bookings for debugging
    console.log('All bookings:', JSON.stringify(searchData.data.map(b => ({
      uid: b.uid,
      attendeeEmail: b.attendees?.[0]?.email,
      responsesEmail: b.responses?.email
    }))));

    // Filter by email
    const matchingBooking = searchData.data.find(booking => {
      const attendeeEmail = booking.attendees?.[0]?.email || booking.responses?.email;
      console.log('Comparing:', attendeeEmail, 'with', customer_email);
      return attendeeEmail && attendeeEmail.toLowerCase() === customer_email.toLowerCase();
    });

    if (!matchingBooking) {
      return res.status(404).json({
        success: false,
        message: `No appointment found for ${customer_email}`
      });
    }

    console.log('Found matching booking:', matchingBooking.uid);

    // Cancel it
    const cancelResponse = await fetch(
      `https://api.cal.com/v2/bookings/${matchingBooking.uid}`,
      {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${process.env.CAL_API_KEY}`,
          'cal-api-version': '2024-08-13',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cancellationReason: 'Cancelled via phone call'
        })
      }
    );

    console.log('Cancel response status:', cancelResponse.status);

    if (!cancelResponse.ok) {
      const cancelError = await cancelResponse.text();
      console.log('Cancel error:', cancelError);
      return res.status(cancelResponse.status).json({
        success: false,
        message: `Failed to cancel: ${cancelError}`
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully'
    });

  } catch (error) {
    console.error('Caught error:', error);
    return res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}
