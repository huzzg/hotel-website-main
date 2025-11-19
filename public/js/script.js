function toggleChatbot() {
  const chatbotBody = document.getElementById('chatbot-body');
  chatbotBody.style.display = chatbotBody.style.display === 'none' ? 'block' : 'none';
}

function sendMessage() {
  const input = document.getElementById('chat-input').value;
  const output = document.getElementById('chat-output');
  if (input.trim()) {
    output.innerHTML += `<p class="text-primary"><strong>Bạn:</strong> ${input}</p>`;
    let response = 'Xin lỗi, tôi không hiểu. Hãy thử hỏi về phòng hoặc dịch vụ khách sạn!';
    if (input.toLowerCase().includes('room')) response = 'Chúng tôi có phòng Deluxe giá $150/đêm tại Đà Nẵng. Hãy đặt ngay!';
    if (input.toLowerCase().includes('check-in')) response = 'Vui lòng cung cấp ngày check-in để chúng tôi hỗ trợ!';
    output.innerHTML += `<p class="text-success"><strong>Bot:</strong> ${response}</p>`;
    output.scrollTop = output.scrollHeight;
    document.getElementById('chat-input').value = '';
  }
}

// Thêm hiệu ứng zoom cho ảnh (tùy chọn)
document.querySelectorAll('.room-card img').forEach(img => {
  img.addEventListener('mouseover', () => img.style.transform = 'scale(1.05)');
  img.addEventListener('mouseout', () => img.style.transform = 'scale(1)');
});