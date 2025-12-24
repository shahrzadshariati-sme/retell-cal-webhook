export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { customer_phone, customer_name } = req.body;

  // Validate inputs - only phone is required now
  if (!customer_phone) {
    return res.status(400).json({ 
      success: false, 
      message: 'Phone number is required' 
    });
  }

  try {
    // 1. Search for bookings by phone number
    const searchResponse = await fetch(
      `https://api.cal.com/v2/bookings?attendeePhoneNumber=${encodeURIComponent(customer_phone)}&status=upcoming`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.CAL_API_KEY}`,
          'cal-api-version': '2024-08-13'
        }
      }
    );

    const searchData = await searchResponse.json();

    if (!searchData.data || searchData.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No upcoming appointments found for this phone number'
      });
    }

    // 2. Get the first upcoming booking
    const booking = searchData.data[0];

    // 3. Cancel the booking
    const cancelResponse = await fetch(
      `https://api.cal.com/v2/bookings/${booking.uid}`,
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
      throw new Error('Failed to cancel booking');
    }

    return res.status(200).json({
      success: true,
      message: 'Appointment cancelled successfully'
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to cancel appointment'
    });
  }
}
