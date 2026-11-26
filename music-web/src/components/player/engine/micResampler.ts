/**
 * Hạ tần số lấy mẫu liên tục về tần số của mô hình (ST-15): Safari và một số máy không mở được AudioContext 22 050 Hz,
 * khi đó thu ở tần số mặc định (44,1 / 48 kHz) rồi hạ xuống ở đây. Lấy trung bình các mẫu rơi vào mỗi ô đầu ra (lọc
 * thông thấp thô, đủ cho nhận nốt piano), giữ phần lẻ giữa các khối để không lệch thời gian.
 */
export class MicResampler {
  private readonly ratio: number;
  /** Vị trí (theo mẫu đầu vào) của mẫu đầu ra kế tiếp, tính từ đầu khối hiện tại. */
  private position = 0;
  private carrySum = 0;
  private carryCount = 0;

  constructor(inputRate: number, outputRate: number) {
    if (!(inputRate > 0) || !(outputRate > 0) || outputRate > inputRate) {
      throw new Error(`Cannot resample ${inputRate} Hz to ${outputRate} Hz`);
    }
    this.ratio = inputRate / outputRate;
  }

  /** Không cần hạ (cùng tần số). */
  get passthrough(): boolean {
    return this.ratio === 1;
  }

  process(input: Float32Array): Float32Array {
    if (this.passthrough) return input;
    const out: number[] = [];
    let sum = this.carrySum;
    let count = this.carryCount;
    let next = this.position + this.ratio;
    for (let i = 0; i < input.length; i++) {
      sum += input[i];
      count += 1;
      if (i + 1 >= next) {
        out.push(sum / count);
        sum = 0;
        count = 0;
        next += this.ratio;
      }
    }
    this.carrySum = sum;
    this.carryCount = count;
    this.position = next - this.ratio - input.length;
    return Float32Array.from(out);
  }
}
