export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { customer_email } = req.body;

  if (!customer_email) {
    return res.status(400).json({ 
      success: false, 
      message: 'Email is required' 
    });
  }

  try {
    // Search for ALL upcoming bookings first
    const searchResponse = await fetch(
      `https://api.cal.com/v2/bookings?status=upcoming`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.CAL_API_KEY}`,
          'cal-api-version': '2024-08-13'
        }
      }
    );

    if (!searchResponse.ok) {
      const errorData = await searchResponse.json();
      return res.status(searchResponse.status).json({
        success: false,
        message: `Cal.com API error: ${JSON.stringify(errorData)}`
      });
    }

    const searchData = await searchResponse.json();

    if (!searchData.data || searchData.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No upcoming appointments found'
      });
    }

    // Filter bookings by email in our code (since API filter doesn't work)
    const matchingBooking = searchData.data.find(booking => {
      const attendeeEmail = booking.attendees?.[0]?.email || booking.responses?.email;
      return attendeeEmail && attendeeEmail.toLowerCase() === customer_email.toLowerCase();
    });

    if (!matchingBooking) {
      return res.status(404).json({
        success: false,
        message: `No upcoming appointment found for ${customer_email}`
      });
    }

    // Cancel the booking
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

    if (!cancelResponse.ok) {
      const cancelError = await cancelResponse.json();
      return res.status(cancelResponse.status).json({
        success: false,
        message: `Failed to cancel: ${JSON.stringify(cancelError)}`
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      message: `Server error: ${error.message}`
    });
  }
}
