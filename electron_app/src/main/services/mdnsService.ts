import Bonjour from 'bonjour-service';

class MDNSService {
  private bonjour = new Bonjour();
  private service?: ReturnType<typeof this.bonjour.publish>;

  start(port: number): void {
    try {
      this.service = this.bonjour.publish({
        name: 'CrossShot Desktop',
        type: 'crossshot',
        port,
        protocol: 'tcp',
      });

      console.log('mDNS service started: CrossShot Desktop');
    } catch (error) {
      console.error('Failed to start mDNS service:', error);
    }
  }

  stop(): void {
    try {
      this.service?.stop();
      this.bonjour.destroy();
      console.log('mDNS service stopped');
    } catch (error) {
      console.error('Failed to stop mDNS service:', error);
    }
  }
}

export default MDNSService;
